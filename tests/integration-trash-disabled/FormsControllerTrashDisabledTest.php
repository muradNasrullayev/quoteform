<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration\TrashDisabled;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use RuntimeException;
use WP_REST_Request;
use WP_REST_Server;
use WP_UnitTestCase;

/**
 * Pins the wiring `FormsControllerTrashSupportTest` (tests/php/Rest/) cannot:
 * that `FormsController::deleteItem()` actually calls `trashIsSupported()`
 * and actually refuses instead of trashing when the Trash is disabled.
 *
 * This lives in its own suite, with its own bootstrap
 * (tests/integration-trash-disabled/bootstrap.php), because it needs
 * `EMPTY_TRASH_DAYS` to be `0` for the whole process — a WordPress constant
 * that cannot be redefined once core has defined it. The sibling bootstrap
 * defines it before WordPress loads, so core's own
 * `wp-includes/default-constants.php` (`if ( ! defined( 'EMPTY_TRASH_DAYS' ) )`)
 * honours it.
 *
 * Mutation check for this test: delete the
 * `if ( ! $this->trashIsSupported() )` guard block in
 * `FormsController::deleteItem()` and this test fails, because
 * `wp_trash_post()` falls through to `wp_delete_post( $id, true )` under
 * `EMPTY_TRASH_DAYS = 0` — the form is permanently destroyed instead of
 * being refused.
 */
final class FormsControllerTrashDisabledTest extends WP_UnitTestCase
{
    /** @var WP_REST_Server */
    private $server;

    protected function setUp(): void
    {
        parent::setUp();

        self::assertSame(
            0,
            (int) EMPTY_TRASH_DAYS,
            'This suite only means what it claims to mean when EMPTY_TRASH_DAYS is 0 — see tests/integration-trash-disabled/bootstrap.php.'
        );

        FormPostType::register();
        Activation::activate();

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;

        do_action( 'rest_api_init' );
    }

    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    private function loginAsManager(): void
    {
        wp_set_current_user( $this->factory->user->create( [ 'role' => 'administrator' ] ) );
    }

    private function createFormViaRest( string $title = 'New quote form' ): int
    {
        $request = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $request->set_body_params( [ 'title' => $title ] );

        $response = $this->server->dispatch( $request );
        $data     = $response->get_data();

        if ( ! isset( $data['id'] ) ) {
            throw new RuntimeException(
                sprintf(
                    'createFormViaRest() fixture failed: status=%d, body=%s',
                    $response->get_status(),
                    wp_json_encode( $data )
                )
            );
        }

        return (int) $data['id'];
    }

    public function testDeleteRefusesWithFiveOhOneInsteadOfPermanentlyDestroyingTheForm(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $response = $this->server->dispatch( new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/' . $formId ) );
        $data     = $response->get_data();

        $this->assertSame( 501, $response->get_status() );
        $this->assertSame( 'rest_trash_not_supported', $data['code'] );

        $post = get_post( $formId );

        $this->assertNotNull( $post, 'The form must still exist — it must not have been permanently deleted.' );
        $this->assertSame( 'publish', $post->post_status );
        $this->assertSame(
            SchemaRepository::defaults(),
            ( new SchemaRepository() )->find( $formId ),
            'The schema must survive the refused delete untouched.'
        );
    }

    public function testWpTrashPostWouldHavePermanentlyDeletedTheFormUnderThisEnvironment(): void
    {
        // Demonstrates the danger the guard exists to prevent, independent
        // of FormsController: under this suite's real EMPTY_TRASH_DAYS = 0,
        // WordPress core's own wp_trash_post() does not trash at all — it
        // falls through to a permanent wp_delete_post( $id, true ).
        $formId = (int) wp_insert_post(
            [
                'post_type'   => FormPostType::POST_TYPE,
                'post_title'  => 'Would be destroyed',
                'post_status' => 'publish',
            ]
        );

        wp_trash_post( $formId );

        $this->assertNull(
            get_post( $formId ),
            'Sanity check on the environment itself: with EMPTY_TRASH_DAYS = 0, wp_trash_post() permanently deletes.'
        );
    }

    public function testDeleteReturns404ForAMissingFormBeforeConsultingTheTrashGuard(): void
    {
        $this->loginAsManager();

        $response = $this->server->dispatch( new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/999999' ) );

        $this->assertSame( 404, $response->get_status() );
    }
}
