<?php

declare(strict_types=1);

namespace Quoteform\Entries;

/**
 * Müraciət siyahısının filtr/sıralama parametrlərinin YEGANƏ oxunuşu (PHP tərəfi).
 *
 * JS əkizi `admin-src/entries/filters.js`-dir; ikisi `tests/fixtures/entry-filters.json`
 * ilə kilidlənib. Etibarsız dəyər səssizcə default-a düşür (spec §2.3), çünki URL
 * istifadəçinin əlindədir və köhnə/pozulmuş link xəta ekranı yox, siyahı göstərməlidir.
 *
 * WordPress-dən asılı deyil.
 */
final class EntryFilters
{
    /** DECIMAL(18,4) sütununa dəqiq sığan onluq: 14 tam + 4 kəsr rəqəmi. */
    public const DECIMAL_PATTERN = '/^-?\d{1,14}(?:\.\d{1,4})?$/D';

    /** 15 rəqəmə qədər: JS `Number` bunu dəqiq saxlayır (2^53 ≈ 9.007e15). */
    private const FORM_PATTERN = '/^[1-9]\d{0,14}$/D';

    private const DATE_PATTERN = '/^(\d{4})-(\d{2})-(\d{2})$/D';

    /**
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'form'    => null,
            'status'  => null,
            'from'    => null,
            'to'      => null,
            'min'     => null,
            'max'     => null,
            'orderby' => 'date',
            'order'   => 'desc',
        ];
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    public static function normalise( array $params ): array
    {
        $filters = self::defaults();

        $form = self::text( $params, 'form' );

        if ( 'deleted' === $form ) {
            $filters['form'] = 'deleted';
        } elseif ( null !== $form && 1 === preg_match( self::FORM_PATTERN, $form ) ) {
            $filters['form'] = (int) $form;
        }

        $status = self::text( $params, 'status' );

        if ( 'new' === $status || 'read' === $status ) {
            $filters['status'] = $status;
        }

        foreach ( [ 'from', 'to' ] as $key ) {
            $value = self::text( $params, $key );

            if ( null !== $value && self::isCalendarDate( $value ) ) {
                $filters[ $key ] = $value;
            }
        }

        foreach ( [ 'min', 'max' ] as $key ) {
            $value = self::text( $params, $key );

            if ( null !== $value && 1 === preg_match( self::DECIMAL_PATTERN, $value ) ) {
                $filters[ $key ] = $value;
            }
        }

        if ( 'total' === self::text( $params, 'orderby' ) ) {
            $filters['orderby'] = 'total';
        }

        if ( 'asc' === self::text( $params, 'order' ) ) {
            $filters['order'] = 'asc';
        }

        return $filters;
    }

    public static function isCalendarDate( string $value ): bool
    {
        if ( 1 !== preg_match( self::DATE_PATTERN, $value, $parts ) ) {
            return false;
        }

        $year = (int) $parts[1];

        return $year >= 1000 && checkdate( (int) $parts[2], (int) $parts[3], $year );
    }

    /**
     * @param array<string, mixed> $params
     */
    private static function text( array $params, string $key ): ?string
    {
        $value = $params[ $key ] ?? null;

        return is_string( $value ) ? $value : null;
    }
}
