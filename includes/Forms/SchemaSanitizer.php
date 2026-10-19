<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Müştəridən gələn sxemin təhlükəsizlik təmizləməsi.
 *
 * Yalnız `html` sahəsinin `content`-i filtrlənir — sxemin qalan sətirləri
 * ya açardır (`KeyRules`), ya da düz mətn kimi göstərilir.
 *
 * Filtr ŞƏRTSİZDİR: `unfiltered_html` icazəsinə və ya cari istifadəçiyə
 * baxmır. Spec §10.2-yə görə sayt sahibi `qform_manage_forms` icazəsini
 * administrator olmayan istifadəçiyə verə bilər; şərtli filtr həmin
 * istifadəçiyə ön tərəfdə JavaScript icra etmək imkanı verərdi.
 *
 * Sxem BURADA hələ validasiyadan keçməyib, ona görə hər addımda forma
 * yoxlanılır: gözlənilməyən quruluş toxunulmadan geri qaytarılır və
 * `SchemaValidator` onu öz xətası ilə rədd edir.
 */
final class SchemaSanitizer
{
    /**
     * @param mixed $schema
     * @return mixed
     */
    public function sanitize( $schema )
    {
        if ( ! is_array( $schema ) || ! isset( $schema['fields'] ) || ! is_array( $schema['fields'] ) ) {
            return $schema;
        }

        foreach ( $schema['fields'] as $key => $field ) {
            if ( ! is_array( $field ) ) {
                continue;
            }

            if ( ! isset( $field['type'] ) || $field['type'] !== 'html' ) {
                continue;
            }

            if ( ! isset( $field['content'] ) || ! is_string( $field['content'] ) ) {
                continue;
            }

            $schema['fields'][ $key ]['content'] = wp_kses_post( $field['content'] );
        }

        return $schema;
    }
}
