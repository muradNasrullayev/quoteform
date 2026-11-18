<?php

declare(strict_types=1);

namespace Quoteform\Notifications;

use Quoteform\Forms\NotificationValidator;
use Quoteform\Runtime\MoneyFormatter;

/**
 * Builds and sends the admin notification email for one new entry.
 * A failed send is recorded in an option so the admin can see it.
 */
final class AdminNotifier
{
    public const FAILURE_OPTION = 'qform_mail_failure';

    /**
     * @param array<string,mixed>                                     $schema   the form's stored schema
     * @param array<string,array<string,mixed>>                       $snapshot SubmissionService::snapshot() output
     * @param array<int,array{key:string,label:string,amount:?float}> $lines    Evaluation breakdown
     */
    public function notify( int $entryId, string $formName, array $schema, array $snapshot, ?float $total, array $lines ): void
    {
        $notification = $this->adminNotification( $schema );

        if ( null === $notification || true !== ( $notification['enabled'] ?? null ) ) {
            return;
        }

        $settings = isset( $schema['settings'] ) && is_array( $schema['settings'] ) ? $schema['settings'] : [];
        $totalText = null === $total ? '—' : $this->money( $total, $settings );

        $subject = $this->subject( (string) ( $notification['subject'] ?? '' ), $formName, $totalText, $entryId );
        $body    = $this->body( $entryId, $formName, $snapshot, $total, $lines, $settings );

        $headers = [ 'Content-Type: text/html; charset=UTF-8' ];
        $replyTo = $this->replyTo( $snapshot );

        if ( null !== $replyTo ) {
            $headers[] = 'Reply-To: ' . $replyTo;
        }

        $sent = false;

        try {
            $sent = (bool) wp_mail( $this->recipients( (string) ( $notification['to'] ?? '' ) ), $subject, $body, $headers );
        } catch ( \Throwable $e ) {
            $sent = false;
        }

        if ( $sent ) {
            delete_option( self::FAILURE_OPTION );

            return;
        }

        update_option( self::FAILURE_OPTION, [ 'entry_id' => $entryId, 'time' => time() ], false );
    }

    /**
     * @param array<string,mixed> $schema
     * @return array<string,mixed>|null
     */
    private function adminNotification( array $schema ): ?array
    {
        $all = isset( $schema['notifications'] ) && is_array( $schema['notifications'] ) ? $schema['notifications'] : [];

        foreach ( $all as $notification ) {
            if ( is_array( $notification ) && 'admin' === ( $notification['type'] ?? null ) ) {
                return $notification;
            }
        }

        return null;
    }

    /**
     * @return string[]
     */
    private function recipients( string $to ): array
    {
        $valid = array_values( array_filter( NotificationValidator::recipients( $to ), 'is_email' ) );
        $valid = array_slice( $valid, 0, NotificationValidator::MAX_RECIPIENTS );

        return [] === $valid ? [ (string) get_option( 'admin_email' ) ] : $valid;
    }

    private function subject( string $template, string $formName, string $totalText, int $entryId ): string
    {
        $replace = static function ( string $text ) use ( $formName, $totalText, $entryId ): string {
            $text = str_replace(
                [ '{form_name}', '{total}', '{entry_id}' ],
                [ $formName, $totalText, (string) $entryId ],
                $text
            );

            return str_replace( [ "\r", "\n" ], ' ', $text );
        };

        $subject = $replace( $template );

        if ( '' === trim( $subject ) ) {
            $subject = $replace( __( 'New quote: {form_name}', 'quoteform' ) );
        }

        return $subject;
    }

    /**
     * @param array<string,array<string,mixed>> $snapshot
     * @param array<int,array<string,mixed>>    $lines
     * @param array<string,mixed>               $settings
     */
    private function body( int $entryId, string $formName, array $snapshot, ?float $total, array $lines, array $settings ): string
    {
        $cell  = 'padding:6px 10px;border-bottom:1px solid #e5e5e5;text-align:left;vertical-align:top;';
        $html  = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">';
        $html .= '<h2 style="font-size:20px;margin:0 0 16px;">' . $this->esc( $formName ) . '</h2>';
        $html .= '<table style="border-collapse:collapse;width:100%;max-width:600px;">';

        foreach ( $snapshot as $entry ) {
            $html .= '<tr><th style="' . $cell . 'width:40%;">' . $this->esc( (string) ( $entry['label'] ?? '' ) ) . '</th>'
                . '<td style="' . $cell . '">' . $this->esc( $this->answer( $entry ) ) . '</td></tr>';
        }

        $html .= '</table>';

        $priced = [];

        foreach ( $lines as $line ) {
            if ( isset( $line['amount'] ) ) {
                $priced[] = $line;
            }
        }

        if ( [] !== $priced || null !== $total ) {
            $html .= '<table style="border-collapse:collapse;width:100%;max-width:600px;margin-top:16px;">';

            foreach ( $priced as $line ) {
                $html .= '<tr><td style="' . $cell . '">' . $this->esc( (string) $line['label'] ) . '</td>'
                    . '<td style="' . $cell . 'text-align:right;">' . $this->esc( $this->money( $line['amount'], $settings ) ) . '</td></tr>';
            }

            $totalText = null === $total ? '—' : $this->money( $total, $settings );
            $html     .= '<tr><td style="' . $cell . 'font-weight:bold;">' . $this->esc( __( 'Total', 'quoteform' ) ) . '</td>'
                . '<td style="' . $cell . 'font-weight:bold;text-align:right;">' . $this->esc( $totalText ) . '</td></tr>';
            $html     .= '</table>';
        }

        $url   = admin_url( 'admin.php?page=quoteform-entries&entry=' . $entryId );
        $html .= '<p style="margin-top:20px;"><a href="' . esc_url( $url ) . '">' . $this->esc( __( 'View this entry', 'quoteform' ) ) . '</a></p>';

        return $html . '</div>';
    }

    /**
     * @param array<string,mixed> $entry
     */
    private function answer( array $entry ): string
    {
        $value = array_key_exists( 'display', $entry ) ? $entry['display'] : ( $entry['value'] ?? '' );

        if ( is_array( $value ) ) {
            return implode( ', ', array_map( [ $this, 'scalar' ], $value ) );
        }

        return $this->scalar( $value );
    }

    /**
     * @param mixed $value
     */
    private function scalar( $value ): string
    {
        if ( is_bool( $value ) ) {
            return $value ? __( 'Yes', 'quoteform' ) : __( 'No', 'quoteform' );
        }

        return is_scalar( $value ) ? (string) $value : '';
    }

    /**
     * @param array<string,array<string,mixed>> $snapshot
     */
    private function replyTo( array $snapshot ): ?string
    {
        foreach ( $snapshot as $entry ) {
            if ( 'email' === ( $entry['type'] ?? null ) ) {
                $value = $entry['value'] ?? null;

                if ( is_string( $value ) && false !== is_email( $value ) ) {
                    return $value;
                }
            }
        }

        return null;
    }

    private function esc( string $text ): string
    {
        return esc_html( $text );
    }

    /**
     * @param mixed               $amount
     * @param array<string,mixed> $settings
     */
    private function money( $amount, array $settings ): string
    {
        global $wp_locale;

        $thousands = isset( $wp_locale->number_format['thousands_sep'] ) ? (string) $wp_locale->number_format['thousands_sep'] : ',';
        $point     = isset( $wp_locale->number_format['decimal_point'] ) ? (string) $wp_locale->number_format['decimal_point'] : '.';

        return MoneyFormatter::format( $amount, $settings, $thousands, $point );
    }
}
