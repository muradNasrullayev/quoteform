<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Sxemin `notifications` bloku: hazırda yalnız bir `admin` bildirişi.
 *
 * Struktur yoxlamaları dəyər yoxlamalarından əvvəl gəlir; yalnız **əskik**
 * açar erkən qayıtmağa səbəb olur (`SettingsValidator` ilə eyni qayda).
 * Yollar nisbidir (`0.to`); `SchemaValidator` onları `notifications` altına birləşdirir.
 */
final class NotificationValidator
{
    public const MAX_RECIPIENTS = 10;
    public const MAX_SUBJECT    = 200;
    public const KEYS           = [ 'type', 'enabled', 'to', 'subject' ];

    /**
     * @param mixed $notifications
     */
    public function validate( $notifications ): ValidationResult
    {
        $result = new ValidationResult();

        if ( ! is_array( $notifications ) || ( $notifications !== [] && array_keys( $notifications ) !== range( 0, count( $notifications ) - 1 ) ) ) {
            $result->addError( '', 'invalid_type', __( 'Notifications must be a list.', 'quoteform' ) );

            return $result;
        }

        if ( count( $notifications ) > 1 ) {
            $result->addError( '', 'out_of_range', __( 'Only one notification is supported.', 'quoteform' ), [ 'max' => 1 ] );

            return $result;
        }

        foreach ( $notifications as $index => $notification ) {
            $this->validateOne( $notification, (string) $index, $result );
        }

        return $result;
    }

    /**
     * @return string[]
     */
    public static function recipients( string $to ): array
    {
        $parts = array_map( 'trim', explode( ',', $to ) );

        return array_values( array_filter( $parts, static function ( string $part ): bool {
            return $part !== '';
        } ) );
    }

    /**
     * @param mixed $notification
     */
    private function validateOne( $notification, string $at, ValidationResult $result ): void
    {
        if ( ! is_array( $notification ) ) {
            $result->addError( $at, 'invalid_type', __( 'Notifications must be a list.', 'quoteform' ) );

            return;
        }

        foreach ( array_keys( $notification ) as $key ) {
            if ( ! in_array( $key, self::KEYS, true ) ) {
                $result->addError( $at . '.' . $key, 'unknown_key', __( 'Unknown setting.', 'quoteform' ) );
            }
        }

        $hasMissingKey = false;

        foreach ( self::KEYS as $key ) {
            if ( ! array_key_exists( $key, $notification ) ) {
                $result->addError( $at . '.' . $key, 'missing_field', __( 'This setting is required.', 'quoteform' ) );
                $hasMissingKey = true;
            }
        }

        if ( $hasMissingKey ) {
            return;
        }

        if ( $notification['type'] !== 'admin' ) {
            $result->addError( $at . '.type', 'invalid_option', __( 'Unknown notification type.', 'quoteform' ) );
        }

        if ( ! is_bool( $notification['enabled'] ) ) {
            $result->addError( $at . '.enabled', 'invalid_type', __( 'This setting must be true or false.', 'quoteform' ) );
        }

        $this->validateRecipients( $notification['to'], $at . '.to', $result );
        $this->validateSubject( $notification['subject'], $at . '.subject', $result );
    }

    /**
     * @param mixed $to
     */
    private function validateRecipients( $to, string $path, ValidationResult $result ): void
    {
        if ( ! is_string( $to ) ) {
            $result->addError( $path, 'invalid_type', __( 'Enter valid email addresses, separated by commas.', 'quoteform' ) );

            return;
        }

        $recipients = self::recipients( $to );

        if ( count( $recipients ) > self::MAX_RECIPIENTS ) {
            $result->addError(
                $path,
                'out_of_range',
                __( 'Enter at most 10 email addresses.', 'quoteform' ),
                [ 'max' => self::MAX_RECIPIENTS ]
            );

            return;
        }

        foreach ( $recipients as $recipient ) {
            if ( ! is_email( $recipient ) ) {
                $result->addError( $path, 'invalid_option', __( 'Enter valid email addresses, separated by commas.', 'quoteform' ) );

                return;
            }
        }
    }

    /**
     * @param mixed $subject
     */
    private function validateSubject( $subject, string $path, ValidationResult $result ): void
    {
        if ( ! is_string( $subject ) || trim( $subject ) === '' ) {
            $result->addError( $path, 'missing_field', __( 'Enter a subject.', 'quoteform' ) );
        } elseif ( mb_strlen( $subject ) > self::MAX_SUBJECT ) {
            $result->addError(
                $path,
                'out_of_range',
                __( 'The subject can have at most 200 characters.', 'quoteform' ),
                [ 'max' => self::MAX_SUBJECT ]
            );
        } elseif ( preg_match( '/[\r\n]/', $subject ) === 1 ) {
            $result->addError( $path, 'invalid_option', __( 'The subject must be on one line.', 'quoteform' ) );
        }
    }
}
