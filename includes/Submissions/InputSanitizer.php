<?php

declare(strict_types=1);

namespace Quoteform\Submissions;

use Quoteform\Engine\Values as EngineValues;

/**
 * Brauzerdən gələn dəyərlərin qəbulu (yeni spec §4.4). Server burada
 * brauzerdən DAHA SƏRTDİR: interfeysin yarada bilmədiyi hər şey
 * BadSubmission-dır; brauzerin seçə bilmədiyi dəyərlər (hidden, html,
 * heç bir addımda olmayan sahə) sxemin `default`-undan götürülür.
 */
final class InputSanitizer
{
    private const TEXT_LIMIT     = 500;
    private const TEXTAREA_LIMIT = 5000;

    /**
     * @param array<string, mixed> $schema
     * @param mixed                $values
     * @return array<string, mixed>
     */
    public function sanitize( array $schema, $values ): array
    {
        if ( ! is_array( $values ) ) {
            throw new BadSubmission( 'values' );
        }

        $fields = is_array( $schema['fields'] ?? null ) ? $schema['fields'] : [];
        $placed = $this->placedKeys( $schema );
        $clean  = [];

        foreach ( $fields as $key => $field ) {
            $key  = (string) $key;
            $type = $field['type'] ?? '';

            if ( 'hidden' === $type || 'html' === $type || ! isset( $placed[ $key ] ) ) {
                $clean[ $key ] = $field['default'] ?? '';

                continue;
            }

            $clean[ $key ] = $this->one( $field, $values[ $key ] ?? null );
        }

        return $clean;
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $raw
     * @return mixed
     */
    private function one( array $field, $raw )
    {
        switch ( $field['type'] ?? '' ) {
            case 'text':
            case 'tel':
            case 'email':
                return $this->text( $raw, self::TEXT_LIMIT );

            case 'textarea':
                return $this->text( $raw, self::TEXTAREA_LIMIT );

            case 'number':
            case 'slider':
                return $this->number( $raw );

            case 'date':
                return $this->date( $raw );

            case 'select':
            case 'radio':
                return $this->choice( $field, $raw );

            case 'checkbox':
                return $this->choices( $field, $raw );

            case 'toggle':
                return $this->toggle( $raw );
        }

        return '';
    }

    /**
     * Mətn XAM saxlanılır (Ruling R15): trim, teq silmə və ya `&lt;` kodlaşdırması
     * yoxdur, çünki brauzer qaydaları, məcburiliyi və qiyməti məhz bu sətirlə
     * hesablayır — server fərqli sətir qiymətləndirsə, müştərinin görmədiyi
     * sahə 422 verə bilər. Yalnız etibarsız UTF-8 rədd edilir (DB-yə düşməsin).
     * Çıxışda escape oxuyanın işidir (Plan 07 admin, emaillər) — HƏMİŞƏ.
     *
     * @param mixed $raw
     */
    private function text( $raw, int $limit ): string
    {
        if ( null === $raw ) {
            return '';
        }

        if ( is_int( $raw ) || is_float( $raw ) ) {
            $raw = (string) $raw;
        }

        if ( ! is_string( $raw ) || mb_strlen( $raw ) > $limit ) {
            throw new BadSubmission( 'text' );
        }

        // `$strip = true` WP 7.1-də U+FFFD ilə əvəzləyir və heç vaxt '' qaytarmır —
        // brauzerin göndərmədiyi sətri saxlamaq əvəzinə rədd edirik.
        if ( '' !== $raw && '' === wp_check_invalid_utf8( $raw ) ) {
            throw new BadSubmission( 'text' );
        }

        return $raw;
    }

    /**
     * @param mixed $raw
     * @return float|string
     */
    private function number( $raw )
    {
        if ( is_int( $raw ) || is_float( $raw ) ) {
            return is_finite( (float) $raw ) ? (float) $raw : '';
        }

        if ( null === $raw || '' === $raw ) {
            return '';
        }

        if ( ! is_string( $raw ) ) {
            throw new BadSubmission( 'number' );
        }

        if ( ! EngineValues::isNumericString( $raw ) ) {
            return '';
        }

        // "1e400" rəqəm qaydasına uyğundur, amma INF olur — JSON rəqəmi kimi rədd edilir.
        $number = (float) $raw;

        return is_finite( $number ) ? $number : '';
    }

    /**
     * @param mixed $raw
     */
    private function date( $raw ): string
    {
        if ( null === $raw || '' === $raw ) {
            return '';
        }

        if ( ! is_string( $raw ) || 1 !== preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/D', $raw, $parts ) || ! checkdate( (int) $parts[2], (int) $parts[3], (int) $parts[1] ) ) {
            throw new BadSubmission( 'date' );
        }

        return $raw;
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $raw
     */
    private function choice( array $field, $raw ): string
    {
        if ( null === $raw || '' === $raw ) {
            return '';
        }

        if ( ! is_string( $raw ) || ! in_array( $raw, $this->optionValues( $field ), true ) ) {
            throw new BadSubmission( 'choice' );
        }

        return $raw;
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $raw
     * @return string[]
     */
    private function choices( array $field, $raw ): array
    {
        if ( null === $raw ) {
            return [];
        }

        if ( ! is_array( $raw ) ) {
            throw new BadSubmission( 'choices' );
        }

        $allowed = $this->optionValues( $field );
        $chosen  = [];

        foreach ( $raw as $value ) {
            if ( ! is_string( $value ) || ! in_array( $value, $allowed, true ) ) {
                throw new BadSubmission( 'choices' );
            }

            if ( ! in_array( $value, $chosen, true ) ) {
                $chosen[] = $value;
            }
        }

        return $chosen;
    }

    /**
     * @param mixed $raw
     */
    private function toggle( $raw ): int
    {
        if ( true === $raw || 1 === $raw || '1' === $raw ) {
            return 1;
        }

        if ( null === $raw || false === $raw || 0 === $raw || '0' === $raw || '' === $raw ) {
            return 0;
        }

        throw new BadSubmission( 'toggle' );
    }

    /**
     * @param array<string, mixed> $field
     * @return string[]
     */
    private function optionValues( array $field ): array
    {
        $values = [];

        foreach ( is_array( $field['options'] ?? null ) ? $field['options'] : [] as $option ) {
            if ( is_array( $option ) && is_string( $option['value'] ?? null ) ) {
                $values[] = $option['value'];
            }
        }

        return $values;
    }

    /**
     * @param array<string, mixed> $schema
     * @return array<string, true>
     */
    private function placedKeys( array $schema ): array
    {
        $placed = [];

        foreach ( is_array( $schema['steps'] ?? null ) ? $schema['steps'] : [] as $step ) {
            foreach ( is_array( $step['fields'] ?? null ) ? $step['fields'] : [] as $key ) {
                $placed[ (string) $key ] = true;
            }
        }

        return $placed;
    }
}
