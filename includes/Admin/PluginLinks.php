<?php

declare(strict_types=1);

namespace Quoteform\Admin;

/**
 * Plugins siyahısında Quoteform sətrinə «Rate Quoteform» linki.
 *
 * Qəsdən yalnız sətir linkidir: notice, popup və ya təkrar xatırlatma yoxdur —
 * wp.org qaydaları dashboard-u ələ keçirən rəy istəklərini qadağan edir.
 */
final class PluginLinks
{
    public const REVIEW_URL = 'https://wordpress.org/support/plugin/quoteform/reviews/#new-post';

    public static function register(): void
    {
        add_filter( 'plugin_row_meta', [ self::class, 'rowMeta' ], 10, 2 );
    }

    /**
     * @param string[] $links
     * @return string[]
     */
    public static function rowMeta( array $links, string $pluginFile ): array
    {
        if ( ! defined( 'QFORM_FILE' ) || plugin_basename( QFORM_FILE ) !== $pluginFile ) {
            return $links;
        }

        $links[] = sprintf(
            '<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>',
            esc_url( self::REVIEW_URL ),
            esc_html__( 'Rate Quoteform', 'quoteform' )
        );

        return $links;
    }
}
