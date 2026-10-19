<?php

declare(strict_types=1);

namespace Quoteform\Rendering;

use Quoteform\Forms\SchemaSanitizer;

/**
 * Sxemin yalnız render üçün lazım olan hissəsi (spec §11).
 *
 * İCAZƏ SİYAHISIDIR, qadağa siyahısı deyil: gələcəkdə sxemə əlavə olunan
 * hər açar susqunluqla ictimai səhifəyə sızmaq əvəzinə, qəsdən bura
 * yazılmalıdır.
 *
 * `html` sahəsinin məzmunu BURADA da təmizlənir, REST yazma yolunda da
 * (`FormsController`). Bu təkrar deyil, iki müxtəlif hədddir: REST yeganə
 * yazma yolu DEYİL — WP-CLI, miqrasiya skripti, dublikat/import plugin-i və
 * staging sinxronu meta-ya birbaşa yazır (spec §6.1 CPT-ni məhz üçüncü tərəf
 * dublikat plugin-ləri işləsin deyə seçib). Girişdəki təmizlik saxlanılan
 * sənədin doğru olmasına, buradakı isə səhifəyə çıxanın doğru olmasına
 * cavabdehdir (spec §15: "çıxışda escape edilir").
 */
final class SchemaFilter
{
    private const DISPLAY_SETTINGS = [ 'currency', 'currency_position', 'decimals' ];

    /**
     * @param array<string, mixed> $schema
     *
     * @return array<string, mixed>
     */
    public static function forDisplay( array $schema ): array
    {
        $display = [
            'version'      => isset( $schema['version'] ) ? (int) $schema['version'] : 1,
            'settings'     => self::settings( $schema ),
            'fields'       => self::section( $schema, 'fields' ),
            'steps'        => self::section( $schema, 'steps' ),
            'calculations' => self::section( $schema, 'calculations' ),
            'rules'        => self::section( $schema, 'rules' ),
        ];

        /** @var array<string, mixed> $safe */
        $safe = ( new SchemaSanitizer() )->sanitize( $display );

        return $safe;
    }

    /**
     * @param array<string, mixed> $schema
     *
     * @return array<string, mixed>
     */
    private static function settings( array $schema ): array
    {
        $settings = isset( $schema['settings'] ) && is_array( $schema['settings'] ) ? $schema['settings'] : [];
        $kept     = [];

        foreach ( self::DISPLAY_SETTINGS as $key ) {
            if ( array_key_exists( $key, $settings ) ) {
                $kept[ $key ] = $settings[ $key ];
            }
        }

        return $kept;
    }

    /**
     * @param array<string, mixed> $schema
     *
     * @return array<mixed>
     */
    private static function section( array $schema, string $key ): array
    {
        return isset( $schema[ $key ] ) && is_array( $schema[ $key ] ) ? $schema[ $key ] : [];
    }
}
