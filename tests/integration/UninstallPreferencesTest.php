<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Entries\EntryPreferences;
use Quoteform\Support\Capabilities;
use Quoteform\Support\Uninstaller;
use WP_UnitTestCase;

final class UninstallPreferencesTest extends WP_UnitTestCase
{
    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    public function testUninstallForgetsEveryUsersPageSize(): void
    {
        $first  = self::factory()->user->create();
        $second = self::factory()->user->create();
        update_user_meta( $first, EntryPreferences::META, 50 );
        update_user_meta( $second, EntryPreferences::META, 100 );
        update_user_meta( $second, 'some_other_plugin', 'kept' );

        Uninstaller::run();

        $this->assertSame( '', get_user_meta( $first, EntryPreferences::META, true ) );
        $this->assertSame( '', get_user_meta( $second, EntryPreferences::META, true ) );
        $this->assertSame( 'kept', get_user_meta( $second, 'some_other_plugin', true ) );
    }
}
