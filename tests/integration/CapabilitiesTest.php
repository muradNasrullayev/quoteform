<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use WP_UnitTestCase;

final class CapabilitiesTest extends WP_UnitTestCase
{
    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    public function testAllReturnsTheThreeCapabilities(): void
    {
        $this->assertSame(
            [ 'qform_manage_forms', 'qform_view_entries', 'qform_export_entries' ],
            Capabilities::all()
        );
    }

    public function testActivationGrantsEveryCapabilityToAdministrator(): void
    {
        Activation::activate();

        $role = get_role( 'administrator' );

        foreach ( Capabilities::all() as $capability ) {
            $this->assertTrue( $role->has_cap( $capability ), $capability );
        }
    }

    public function testActivationDoesNotGrantToEditor(): void
    {
        Activation::activate();

        $role = get_role( 'editor' );

        foreach ( Capabilities::all() as $capability ) {
            $this->assertFalse( $role->has_cap( $capability ), $capability );
        }
    }

    public function testRevokeRemovesCapabilitiesFromEveryRole(): void
    {
        Activation::activate();
        Capabilities::revokeFromAllRoles();

        $this->assertFalse( get_role( 'administrator' )->has_cap( 'qform_manage_forms' ) );
    }

    public function testGrantIsIdempotent(): void
    {
        Activation::activate();
        Activation::activate();

        $this->assertTrue( get_role( 'administrator' )->has_cap( 'qform_manage_forms' ) );
    }

    public function testDeactivationKeepsCapabilities(): void
    {
        Activation::activate();
        Activation::deactivate();

        $this->assertTrue(
            get_role( 'administrator' )->has_cap( 'qform_manage_forms' ),
            'Deaktivasiya capability-ləri silməməlidir — plugin yenidən aktivləşdirilə bilər.'
        );
    }
}
