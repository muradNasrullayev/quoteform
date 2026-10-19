<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Sxemin `settings` bloku.
 *
 * `decimals` üst həddi (6) təsadüfi deyil: mühərrikin `Functions::MAX_PRECISION`
 * sabiti ilə eynidir. Daha böyük dəqiqlik tələb edən sxem forma işləyəndə
 * `invalid_precision` atardı — bunu saxlama anında tutmaq daha yaxşıdır.
 *
 * Struktur yoxlamaları (əskik/artıq açar) dəyər yoxlamalarından əvvəl gəlir və
 * yalnız **əskik** bir açar aşkarlandıqda erkən qayıdır — sonrakı yoxlamalar
 * həmin açarların mövcudluğunu güman edir, əks halda `undefined index` xətası
 * alardıq. Artıq (naməlum) açar heç nəyi silmir: bütün tələb olunan açarlar
 * yenə mövcuddur, ona görə bu halda erkən qayıtmırıq — naməlum açar xətası
 * qeydə alınır, amma dəyər yoxlamaları yenə işləyir.
 */
final class SettingsValidator
{
    private const MAX_DECIMALS = 6;

    /** @var string[] `redirect_url` may only use these schemes (spec: no `javascript:`/`data:`/`file:` etc). */
    private const ALLOWED_REDIRECT_SCHEMES = [ 'http', 'https' ];

    private const ALLOWED_KEYS = [
        'currency',
        'currency_position',
        'decimals',
        'submit_label',
        'success_action',
        'success_message',
        'redirect_url',
        'save_resume',
        'store_ip',
    ];

    /**
     * @param mixed $settings
     */
    public function validate( $settings ): ValidationResult
    {
        $result = new ValidationResult();

        if ( ! is_array( $settings ) ) {
            $result->addError( '', 'invalid_type', __( 'Settings must be an object.', 'quoteform' ) );

            return $result;
        }

        foreach ( array_keys( $settings ) as $key ) {
            if ( ! in_array( $key, self::ALLOWED_KEYS, true ) ) {
                $result->addError( (string) $key, 'unknown_key', __( 'Unknown setting.', 'quoteform' ) );
            }
        }

        $hasMissingKey = false;

        foreach ( self::ALLOWED_KEYS as $key ) {
            if ( ! array_key_exists( $key, $settings ) ) {
                $result->addError( $key, 'missing_field', __( 'This setting is required.', 'quoteform' ) );
                $hasMissingKey = true;
            }
        }

        if ( $hasMissingKey ) {
            return $result;
        }

        if ( ! is_string( $settings['currency'] ) || preg_match( '/^[A-Z]{3}$/D', $settings['currency'] ) !== 1 ) {
            $result->addError( 'currency', 'invalid_option', __( 'Currency must be a three-letter code such as USD.', 'quoteform' ) );
        }

        if ( ! in_array( $settings['currency_position'], [ 'before', 'after' ], true ) ) {
            $result->addError( 'currency_position', 'invalid_option', __( 'Currency position must be "before" or "after".', 'quoteform' ) );
        }

        if ( ! is_int( $settings['decimals'] ) ) {
            $result->addError( 'decimals', 'invalid_type', __( 'Decimals must be a whole number.', 'quoteform' ) );
        } elseif ( $settings['decimals'] < 0 || $settings['decimals'] > self::MAX_DECIMALS ) {
            $result->addError(
                'decimals',
                'out_of_range',
                __( 'Decimals must be between 0 and 6.', 'quoteform' ),
                [ 'min' => 0, 'max' => self::MAX_DECIMALS ]
            );
        }

        if ( ! is_string( $settings['submit_label'] ) || trim( $settings['submit_label'] ) === '' ) {
            $result->addError( 'submit_label', 'missing_field', __( 'The submit button needs a label.', 'quoteform' ) );
        }

        if ( ! in_array( $settings['success_action'], [ 'message', 'redirect' ], true ) ) {
            $result->addError( 'success_action', 'invalid_option', __( 'Success action must be "message" or "redirect".', 'quoteform' ) );
        } elseif ( $settings['success_action'] === 'message' ) {
            if ( ! is_string( $settings['success_message'] ) || trim( $settings['success_message'] ) === '' ) {
                $result->addError( 'success_message', 'missing_field', __( 'A success message is required.', 'quoteform' ) );
            }
        } else {
            if ( ! is_string( $settings['redirect_url'] ) || trim( $settings['redirect_url'] ) === '' ) {
                $result->addError( 'redirect_url', 'missing_field', __( 'A redirect URL is required.', 'quoteform' ) );
            } elseif ( filter_var( $settings['redirect_url'], FILTER_VALIDATE_URL ) === false || ! self::hasAllowedScheme( $settings['redirect_url'] ) ) {
                $result->addError( 'redirect_url', 'invalid_option', __( 'The redirect URL must start with http:// or https://.', 'quoteform' ) );
            }
        }

        foreach ( [ 'save_resume', 'store_ip' ] as $flag ) {
            if ( ! is_bool( $settings[ $flag ] ) ) {
                $result->addError( $flag, 'invalid_type', __( 'This setting must be true or false.', 'quoteform' ) );
            }
        }

        return $result;
    }

    /**
     * Restricts `redirect_url` to an explicit scheme allowlist.
     *
     * `FILTER_VALIDATE_URL` is not a scheme allowlist: `javascript://x%0aalert(1)`,
     * `file:///etc/passwd` and `ftp://a.b/c` all pass it. This class is the gate
     * the spec designates for unstorable configuration, so the scheme must be
     * checked explicitly here rather than trusted to a future `esc_url()` at
     * render time. `wp_parse_url()` only differs from PHP's `parse_url()` for
     * scheme-relative URLs (`//host`), which have no scheme either way, so it
     * extracts the scheme correctly for every probed bypass, including the
     * `%0a` line-comment trick.
     */
    private static function hasAllowedScheme( string $url ): bool
    {
        $scheme = wp_parse_url( $url, PHP_URL_SCHEME );

        return is_string( $scheme ) && in_array( strtolower( $scheme ), self::ALLOWED_REDIRECT_SCHEMES, true );
    }
}
