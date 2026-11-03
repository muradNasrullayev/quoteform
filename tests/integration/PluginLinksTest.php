<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Admin\PluginLinks;
use WP_UnitTestCase;

final class PluginLinksTest extends WP_UnitTestCase
{
    public function testRegisterHooksIntoThePluginRowMeta(): void
    {
        PluginLinks::register();

        $this->assertSame( 10, has_filter( 'plugin_row_meta', [ PluginLinks::class, 'rowMeta' ] ) );
    }

    public function testAddsTheRateLinkToQuoteformsOwnRow(): void
    {
        $links = PluginLinks::rowMeta( [ 'Version 0.1.3' ], plugin_basename( QFORM_FILE ) );

        $this->assertCount( 2, $links );
        $this->assertSame( 'Version 0.1.3', $links[0], 'Core links must stay first and unchanged.' );
        $this->assertStringContainsString( 'href="' . PluginLinks::REVIEW_URL . '"', $links[1] );
        $this->assertStringContainsString( 'target="_blank"', $links[1] );
        $this->assertStringContainsString( 'rel="noopener noreferrer"', $links[1] );
        $this->assertStringContainsString( 'Rate Quoteform', $links[1] );
    }

    public function testLeavesOtherPluginsRowsAlone(): void
    {
        $links = [ 'Version 1.0', '<a href="https://example.org">Visit plugin site</a>' ];

        $this->assertSame( $links, PluginLinks::rowMeta( $links, 'akismet/akismet.php' ) );
    }

    public function testTheReviewUrlPointsAtTheDirectoryReviewForm(): void
    {
        $this->assertSame( 'https://wordpress.org/support/plugin/quoteform/reviews/#new-post', PluginLinks::REVIEW_URL );
    }
}
