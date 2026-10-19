<?php

declare(strict_types=1);

namespace Quoteform\Rendering;

final class Shortcode
{
    public const TAG = 'quoteform';

    public static function register(): void
    {
        add_shortcode( self::TAG, [ self::class, 'render' ] );
    }

    /**
     * @param array<string, mixed>|string $attributes
     */
    public static function render( $attributes ): string
    {
        $parsed = shortcode_atts( [ 'id' => 0 ], is_array( $attributes ) ? $attributes : [], self::TAG );
        $formId = (int) $parsed['id'];

        if ( $formId < 1 ) {
            return '';
        }

        $renderer = new FormRenderer();

        return $renderer->render( $formId );
    }
}
