<?php

declare(strict_types=1);

namespace Quoteform\Submissions;

use Quoteform\Entries\EntryRepository;
use Quoteform\Forms\CorruptSchemaException;
use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Runtime\Evaluation;
use Quoteform\Runtime\MoneyFormatter;
use Quoteform\Runtime\Validator;
use WP_Post;

/**
 * Göndərmə axınının sahibi (yeni spec §3, §4). Qiymət burada SIFIRDAN
 * hesablanır; brauzerin göndərdiyi heç bir rəqəmə etibar edilmir.
 */
final class SubmissionService
{
    public const NONCE_ACTION = 'qform_submit';

    /** @var SchemaRepository */
    private $forms;

    /** @var EntryRepository */
    private $entries;

    /** @var SpamGuard */
    private $spam;

    /** @var InputSanitizer */
    private $sanitizer;

    public function __construct( ?SchemaRepository $forms = null, ?EntryRepository $entries = null, ?SpamGuard $spam = null, ?InputSanitizer $sanitizer = null )
    {
        $this->forms     = $forms ?? new SchemaRepository();
        $this->entries   = $entries ?? new EntryRepository();
        $this->spam      = $spam ?? SpamGuard::fromWordPress();
        $this->sanitizer = $sanitizer ?? new InputSanitizer();
    }

    public static function isPublishedForm( int $formId ): bool
    {
        $post = get_post( $formId );

        return $post instanceof WP_Post && FormPostType::POST_TYPE === $post->post_type && 'publish' === $post->post_status;
    }

    /**
     * @param array<string, mixed> $request
     * @param array<string, mixed> $context
     * @return array{status: int, body: array<string, mixed>}
     */
    public function submit( array $request, array $context ): array
    {
        $formId = (int) ( $request['form_id'] ?? 0 );
        $schema = $this->publishedSchema( $formId );

        if ( null === $schema ) {
            return $this->failure( 404, 'qform_not_found', __( 'This form is not available.', 'quoteform' ) );
        }

        $settings = is_array( $schema['settings'] ?? null ) ? $schema['settings'] : [];

        if ( $this->spam->isSpam( $formId, $request['hp'] ?? '', $request['ticket'] ?? null ) ) {
            return [ 'status' => 201, 'body' => $this->successBody( $settings, null, [] ) ];
        }

        try {
            $state = $this->sanitizer->sanitize( $schema, $request['values'] ?? [] );
        } catch ( BadSubmission $error ) {
            return $this->failure( 400, 'qform_bad_request', __( 'This submission could not be accepted.', 'quoteform' ) );
        }

        $evaluation = Evaluation::run( $schema, $state );

        if ( [] !== $evaluation['errors'] ) {
            return [
                'status' => 422,
                'body'   => [
                    'code'    => 'qform_invalid_submission',
                    'message' => __( 'Some answers need attention.', 'quoteform' ),
                    'errors'  => $this->messages( $schema, $evaluation['errors'] ),
                    'step'    => Validator::firstErrorStep( $schema, $evaluation['visibility'], $evaluation['errors'] ),
                ],
            ];
        }

        $total    = null === $evaluation['calc_error'] ? $evaluation['total'] : null;
        $currency = is_string( $settings['currency'] ?? null ) ? $settings['currency'] : 'USD';

        $saved = $this->entries->insert(
            [
                'form_id'    => $formId,
                'status'     => 'completed',
                'total'      => $total,
                'currency'   => $currency,
                'data'       => $this->snapshot( $schema, $state, $evaluation['visibility']['fields'] ),
                'breakdown'  => [
                    'currency' => $currency,
                    'position' => $settings['currency_position'] ?? 'before',
                    'decimals' => $settings['decimals'] ?? 2,
                    'lines'    => $evaluation['breakdown'],
                    'error'    => $evaluation['calc_error'],
                ],
                'user_id'    => ( (int) ( $context['user_id'] ?? 0 ) ) > 0 ? (int) $context['user_id'] : null,
                'ip'         => $this->ip( $settings, $context['ip'] ?? null ),
                // Bayt kəsimi çox-baytlı simvolu ortadan bölüb sütunu etibarsız UTF-8 edə bilər
                // (`$wpdb->insert()` sonra 500 verər və müraciət itər) — ona görə simvol sayı ilə kəsilir.
                'user_agent' => mb_substr( wp_check_invalid_utf8( (string) ( $context['user_agent'] ?? '' ) ), 0, 255 ),
            ]
        );

        if ( 0 === $saved ) {
            return $this->failure( 500, 'qform_save_failed', __( 'Your answers could not be saved. Please try again.', 'quoteform' ) );
        }

        return [ 'status' => 201, 'body' => $this->successBody( $settings, $total, $evaluation['breakdown'] ) ];
    }

    /**
     * `find()` returning `null` means "no schema meta saved yet", which is
     * exactly what `FormRenderer`/`FormsController` treat as "show
     * `SchemaRepository::defaults()`" — the form is visible with the default
     * schema, so submissions must be accepted against that same schema
     * instead of 404ing. A genuinely corrupt schema stays a 404.
     *
     * @return array<string, mixed>|null
     */
    private function publishedSchema( int $formId ): ?array
    {
        if ( $formId < 1 || ! self::isPublishedForm( $formId ) ) {
            return null;
        }

        try {
            $schema = $this->forms->find( $formId );
        } catch ( CorruptSchemaException $error ) {
            return null;
        }

        return $schema ?? SchemaRepository::defaults();
    }

    /**
     * @param array<string, mixed>                                              $settings
     * @param array<int, array{key: string, label: string, amount: ?float}>     $breakdown
     * @return array<string, mixed>
     */
    private function successBody( array $settings, ?float $total, array $breakdown ): array
    {
        if ( 'redirect' === ( $settings['success_action'] ?? null ) ) {
            return [ 'success_action' => 'redirect', 'redirect_url' => (string) ( $settings['redirect_url'] ?? '' ) ];
        }

        $lines = [];

        foreach ( $breakdown as $line ) {
            $lines[] = [ 'label' => $line['label'], 'formatted' => $this->money( $line['amount'], $settings ) ];
        }

        return [
            'success_action' => 'message',
            'message'        => (string) ( $settings['success_message'] ?? '' ),
            'total'          => null === $total ? null : $this->money( $total, $settings ),
            'breakdown'      => null === $total ? [] : $lines,
        ];
    }

    /**
     * @param mixed                $amount
     * @param array<string, mixed> $settings
     */
    private function money( $amount, array $settings ): string
    {
        global $wp_locale;

        $thousands = isset( $wp_locale->number_format['thousands_sep'] ) ? (string) $wp_locale->number_format['thousands_sep'] : ',';
        $point     = isset( $wp_locale->number_format['decimal_point'] ) ? (string) $wp_locale->number_format['decimal_point'] : '.';

        return MoneyFormatter::format( $amount, $settings, $thousands, $point );
    }

    /**
     * @param array<string, mixed>  $schema
     * @param array<string, string> $codes
     * @return array<string, string>
     */
    private function messages( array $schema, array $codes ): array
    {
        $messages = [];

        foreach ( $codes as $key => $code ) {
            $field = $schema['fields'][ $key ] ?? [];

            switch ( $code ) {
                case 'required':
                    $messages[ $key ] = __( 'This field is required.', 'quoteform' );
                    break;
                case 'email':
                    $messages[ $key ] = __( 'Enter an email address.', 'quoteform' );
                    break;
                case 'min':
                    /* translators: %s: the smallest allowed number. */
                    $messages[ $key ] = sprintf( __( 'Enter %s or more.', 'quoteform' ), $field['min'] ?? '' );
                    break;
                default:
                    /* translators: %s: the largest allowed number. */
                    $messages[ $key ] = sprintf( __( 'Enter %s or less.', 'quoteform' ), $field['max'] ?? '' );
            }
        }

        return $messages;
    }

    /**
     * Sahənin label-i və tipi dəyərlə BİRLİKDƏ saxlanılır (yeni spec §4.6):
     * sonra sxem dəyişsə də köhnə müraciət düzgün oxunur.
     *
     * @param array<string, mixed> $schema
     * @param array<string, mixed> $state
     * @param array<string, true>  $visible
     * @return array<string, array<string, mixed>>
     */
    private function snapshot( array $schema, array $state, array $visible ): array
    {
        $snapshot = [];

        foreach ( is_array( $schema['fields'] ?? null ) ? $schema['fields'] : [] as $key => $field ) {
            $key  = (string) $key;
            $type = (string) ( $field['type'] ?? '' );

            if ( 'html' === $type || ! isset( $visible[ $key ] ) ) {
                continue;
            }

            $entry = [ 'label' => (string) ( $field['label'] ?? '' ), 'type' => $type, 'value' => $state[ $key ] ?? '' ];

            if ( 'select' === $type || 'radio' === $type ) {
                $entry['display'] = $this->optionLabel( $field, $entry['value'] );
            } elseif ( 'checkbox' === $type ) {
                $entry['display'] = array_map(
                    function ( $value ) use ( $field ): string {
                        return $this->optionLabel( $field, $value );
                    },
                    is_array( $entry['value'] ) ? $entry['value'] : []
                );
            }

            $snapshot[ $key ] = $entry;
        }

        return $snapshot;
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $value
     */
    private function optionLabel( array $field, $value ): string
    {
        foreach ( is_array( $field['options'] ?? null ) ? $field['options'] : [] as $option ) {
            if ( is_array( $option ) && ( $option['value'] ?? null ) === $value ) {
                return (string) ( $option['label'] ?? '' );
            }
        }

        return '';
    }

    /**
     * @param array<string, mixed> $settings
     * @param mixed                $ip
     */
    private function ip( array $settings, $ip ): ?string
    {
        if ( true !== ( $settings['store_ip'] ?? false ) || ! is_string( $ip ) || false === filter_var( $ip, FILTER_VALIDATE_IP ) ) {
            return null;
        }

        $packed = inet_pton( $ip );

        return false === $packed ? null : $packed;
    }

    /**
     * @return array{status: int, body: array<string, mixed>}
     */
    private function failure( int $status, string $code, string $message ): array
    {
        return [ 'status' => $status, 'body' => [ 'code' => $code, 'message' => $message ] ];
    }
}
