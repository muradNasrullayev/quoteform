<?php

declare(strict_types=1);

namespace Quoteform\Tests\Rest;

use PHPUnit\Framework\TestCase;
use Quoteform\Rest\FormsController;

/**
 * `FormsController::deleteItem()` must refuse to trash a form — rather than
 * let WordPress core's own `wp_trash_post()` fall through to a permanent,
 * unrecoverable `wp_delete_post( $id, true )` — whenever the site's Trash is
 * disabled (`define( 'EMPTY_TRASH_DAYS', 0 )`, a documented, widely used
 * setting).
 *
 * This unit test only covers the pure predicate that decision is built on:
 * `isTrashEnabledFor()`. It does NOT mean the full decision is untestable
 * end-to-end. `EMPTY_TRASH_DAYS` is indeed a PHP constant that cannot be
 * redefined mid-process once WordPress core has defined it — but that
 * definition (`wp-includes/default-constants.php`) is itself conditional
 * (`if ( ! defined( 'EMPTY_TRASH_DAYS' ) )`), so a bootstrap that defines it
 * *before* WordPress loads is honoured by core for the rest of the process.
 * `tests/integration-trash-disabled/` does exactly that, and dispatches a
 * real DELETE request through `WP_REST_Server` against it — see
 * `FormsControllerTrashDisabledTest::testDeleteRefusesWithFiveOhOneInsteadOfPermanentlyDestroyingTheForm()`.
 * This unit test remains useful on its own merits: it is faster, and it
 * pins the pure predicate in isolation from any WordPress bootstrap. The
 * normal integration suite's own
 * `FormsControllerWriteTest::testDeletingAnAlreadyTrashedFormStillReturns200()`
 * separately covers the Trash-enabled path, which is that suite's real,
 * unmodifiable environment.
 */
final class FormsControllerTrashSupportTest extends TestCase
{
    public function testIsTrashEnabledForMirrorsWordPressCoresOwnGate(): void
    {
        // WordPress core's wp_trash_post(): `if ( ! EMPTY_TRASH_DAYS ) { ... permanently delete ... }`
        $this->assertFalse( FormsController::isTrashEnabledFor( 0 ) );

        $this->assertTrue( FormsController::isTrashEnabledFor( 30 ) );
        $this->assertTrue( FormsController::isTrashEnabledFor( 1 ) );
    }

    public function testIsTrashEnabledForTreatsNegativeDaysAsDisabled(): void
    {
        // Not a realistic WordPress setting, but the predicate must not
        // treat an unexpected negative value as "enabled".
        $this->assertFalse( FormsController::isTrashEnabledFor( -1 ) );
    }
}
