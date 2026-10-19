<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Support\Activation;
use WP_UnitTestCase;

/**
 * WordPress aktivasiya hook-una `$network_wide` üçün `null` ötürə bilər
 * (məs. wp-cli `plugin activate` / `plugin install --activate`). Çağırış
 * core-dan gəldiyi üçün `bool` tipli parametr TypeError verirdi.
 */
final class ActivationHookArgumentTest extends WP_UnitTestCase
{
    public function testActivationAcceptsANullNetworkWideArgumentFromCore(): void
    {
        add_action( 'qform_test_activation', [ Activation::class, 'activate' ] );

        do_action( 'qform_test_activation', null );

        $this->assertTrue( get_role( 'administrator' )->has_cap( 'qform_manage_forms' ) );
    }
}
