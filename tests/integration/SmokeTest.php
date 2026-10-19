<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use WP_UnitTestCase;

final class SmokeTest extends WP_UnitTestCase
{
    public function testWordPressIsLoaded(): void
    {
        $this->assertTrue( defined( 'ABSPATH' ) );
        $this->assertTrue( function_exists( 'wp_insert_post' ) );
    }

    public function testPluginBootstrapRan(): void
    {
        $this->assertTrue( defined( 'QFORM_VERSION' ) );
        $this->assertSame( '0.1.0', QFORM_VERSION );
    }

    public function testEngineAutoloadsInsideWordPress(): void
    {
        $this->assertSame(
            507.0,
            \Quoteform\Engine\Expression::evaluate(
                'round({subtotal} * 1.3, 2)',
                [ 'subtotal' => 390.0 ]
            )
        );
    }
}
