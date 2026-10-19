<?php

declare(strict_types=1);

namespace Quoteform\Entries;

use DateTimeImmutable;
use DateTimeZone;
use Quoteform\Runtime\MoneyFormatter;
use Quoteform\Runtime\Values;
use WP_User;

/**
 * Saxlanmış müraciəti admin ekranı üçün HAZIR şəklə salır (spec §2.4): məbləğ,
 * tarix və cavabların göstərilən mətni serverdədir, JS-də ikinci format kodu yoxdur.
 *
 * Mətn XAM qalır (Plan 06 R15). JSON-a escape yazılmır, çünki React onu text node
 * kimi göstərir — burada esc_html etmək ekranda `&lt;b&gt;` göstərərdi. HTML çap
 * edən hər PHP yeri öz esc_* çağırışını edir.
 */
final class EntryPresenter
{
    /**
     * @param array<string, mixed> $entry  EntryRepository::hydrate()
     * @param array<int, string>   $titles FormDirectory::titles()
     * @return array<string, mixed>
     */
    public function listItem( array $entry, array $titles ): array
    {
        $answers = $this->answers( $entry );

        return [
            'id'            => (int) $entry['id'],
            'form_id'       => (int) $entry['form_id'],
            'form_title'    => $this->formTitle( (int) $entry['form_id'], $titles ),
            'is_read'       => null !== $entry['read_at'],
            'name'          => self::first( $answers, 'text' ),
            'email'         => self::first( $answers, 'email' ),
            'total'         => $entry['total_decimal'],
            'total_display' => null === $entry['total'] ? '' : $this->money( $entry['total'], $entry ),
            'date'          => $this->date( (string) $entry['created_at'] ),
        ];
    }

    /**
     * @param array<string, mixed> $entry
     * @param array<int, string>   $titles
     * @return array<string, mixed>
     */
    public function detail( array $entry, array $titles ): array
    {
        $breakdown = is_array( $entry['breakdown'] ?? null ) ? $entry['breakdown'] : [];
        $lines     = [];

        foreach ( is_array( $breakdown['lines'] ?? null ) ? $breakdown['lines'] : [] as $line ) {
            if ( ! is_array( $line ) ) {
                continue;
            }

            $amount  = $line['amount'] ?? null;
            $lines[] = [
                'key'            => (string) ( $line['key'] ?? '' ),
                'label'          => (string) ( $line['label'] ?? '' ),
                'amount_display' => ( is_int( $amount ) || is_float( $amount ) ) ? $this->money( $amount, $entry ) : '',
            ];
        }

        return array_merge(
            $this->listItem( $entry, $titles ),
            [
                'answers'   => $this->answers( $entry ),
                'breakdown' => [
                    'lines' => $lines,
                    'error' => is_string( $breakdown['error'] ?? null ) ? $breakdown['error'] : null,
                ],
                'details'   => [
                    'ip'         => self::ip( $entry['ip'] ?? null ),
                    'user_agent' => (string) ( $entry['user_agent'] ?? '' ),
                    'user'       => self::user( $entry['user_id'] ?? null ),
                    'submitted'  => $this->date( (string) $entry['created_at'] ),
                ],
            ]
        );
    }

    /**
     * @param array<string, mixed> $entry
     * @return array<int, array{key: string, label: string, type: string, display: string}>
     */
    public function answers( array $entry ): array
    {
        $answers = [];

        foreach ( is_array( $entry['data'] ?? null ) ? $entry['data'] : [] as $key => $answer ) {
            if ( ! is_array( $answer ) ) {
                continue;
            }

            $answers[] = [
                'key'     => (string) $key,
                'label'   => (string) ( $answer['label'] ?? '' ),
                'type'    => (string) ( $answer['type'] ?? '' ),
                'display' => self::display( $answer ),
            ];
        }

        return $answers;
    }

    /**
     * Bir cavabın göstərilən mətni — admin detalı və CSV eyni funksiyanı işlədir.
     *
     * @param array<string, mixed> $answer snapshot elementi: label, type, value, (display)
     */
    public static function display( array $answer ): string
    {
        $value = $answer['value'] ?? '';

        switch ( (string) ( $answer['type'] ?? '' ) ) {
            case 'toggle':
                return ( 1 === $value || true === $value || '1' === $value ) ? __( 'Yes', 'quoteform' ) : __( 'No', 'quoteform' );

            case 'checkbox':
                $labels  = [];
                $display = is_array( $answer['display'] ?? null ) ? array_values( $answer['display'] ) : [];

                foreach ( is_array( $value ) ? array_values( $value ) : [] as $index => $item ) {
                    $label    = $display[ $index ] ?? '';
                    $labels[] = is_string( $label ) && '' !== $label ? $label : self::scalar( $item );
                }

                return implode( ', ', $labels );

            case 'select':
            case 'radio':
                $label = $answer['display'] ?? '';

                return is_string( $label ) && '' !== $label ? $label : self::scalar( $value );
        }

        return self::scalar( $value );
    }

    /**
     * @param array<int, string> $titles
     */
    public function formTitle( int $formId, array $titles ): ?string
    {
        if ( ! array_key_exists( $formId, $titles ) ) {
            return null;
        }

        return '' === trim( $titles[ $formId ] )
            /* translators: %d: form id. */
            ? sprintf( __( 'Form #%d', 'quoteform' ), $formId )
            : $titles[ $formId ];
    }

    /**
     * @return array{display: string, full: string, iso: string}
     */
    public function date( string $createdAt ): array
    {
        $timestamp = self::timestamp( $createdAt );
        $format    = trim( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ) );

        return [
            'display' => (string) wp_date( '' === $format ? 'Y-m-d H:i' : $format, $timestamp ),
            'full'    => (string) wp_date( 'Y-m-d H:i:s T', $timestamp ),
            'iso'     => gmdate( 'Y-m-d\TH:i:s\Z', $timestamp ),
        ];
    }

    public function csvDate( string $createdAt ): string
    {
        return (string) wp_date( 'Y-m-d H:i:s', self::timestamp( $createdAt ) );
    }

    /**
     * `created_at` UTC-dir (EntryRepository `gmdate` yazır).
     */
    private static function timestamp( string $createdAt ): int
    {
        return ( new DateTimeImmutable( $createdAt, new DateTimeZone( 'UTC' ) ) )->getTimestamp();
    }

    /**
     * @param int|float            $amount
     * @param array<string, mixed> $entry
     */
    private function money( $amount, array $entry ): string
    {
        global $wp_locale;

        $breakdown = is_array( $entry['breakdown'] ?? null ) ? $entry['breakdown'] : [];
        $settings  = [
            'currency'          => is_string( $breakdown['currency'] ?? null ) ? $breakdown['currency'] : (string) $entry['currency'],
            'currency_position' => $breakdown['position'] ?? 'before',
            'decimals'          => $breakdown['decimals'] ?? 2,
        ];
        $thousands = isset( $wp_locale->number_format['thousands_sep'] ) ? (string) $wp_locale->number_format['thousands_sep'] : ',';
        $point     = isset( $wp_locale->number_format['decimal_point'] ) ? (string) $wp_locale->number_format['decimal_point'] : '.';

        return MoneyFormatter::format( $amount, $settings, $thousands, $point );
    }

    /**
     * @param array<int, array{key: string, label: string, type: string, display: string}> $answers
     */
    private static function first( array $answers, string $type ): string
    {
        foreach ( $answers as $answer ) {
            if ( $type === $answer['type'] && '' !== $answer['display'] ) {
                return $answer['display'];
            }
        }

        return '';
    }

    /**
     * @param mixed $value
     */
    private static function scalar( $value ): string
    {
        if ( is_string( $value ) ) {
            return $value;
        }

        if ( is_int( $value ) || is_float( $value ) ) {
            return Values::stringify( $value );
        }

        return '';
    }

    /**
     * @param mixed $packed
     */
    private static function ip( $packed ): ?string
    {
        // Binar sütun: uzunluq BAYTLA ölçülür (4 = IPv4, 16 = IPv6) — burada strlen düzgündür.
        if ( ! is_string( $packed ) || ! in_array( strlen( $packed ), [ 4, 16 ], true ) ) {
            return null;
        }

        $text = inet_ntop( $packed );

        return false === $text ? null : $text;
    }

    /**
     * @param mixed $userId
     * @return array{id: int, name: string, url: ?string}|null
     */
    private static function user( $userId ): ?array
    {
        if ( ! is_int( $userId ) || $userId < 1 ) {
            return null;
        }

        $user = get_userdata( $userId );

        if ( ! $user instanceof WP_User ) {
            return [
                'id'   => $userId,
                /* translators: %d: user id. */
                'name' => sprintf( __( 'Deleted user #%d', 'quoteform' ), $userId ),
                'url'  => null,
            ];
        }

        return [
            'id'   => $userId,
            'name' => (string) $user->display_name,
            'url'  => current_user_can( 'edit_user', $userId ) ? (string) get_edit_user_link( $userId ) : null,
        ];
    }
}
