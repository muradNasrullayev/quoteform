<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Plugin;
use Quoteform\Rendering\Block;
use Quoteform\Rendering\ElementorWidget;
use Quoteform\Rendering\Shortcode;
use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use WP_REST_Request;
use WP_REST_Server;
use WP_UnitTestCase;

final class PluginTest extends WP_UnitTestCase
{
    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    public function testBootRegistersThePostTypeOnInit(): void
    {
        Plugin::boot();

        do_action( 'init' );

        $this->assertTrue( post_type_exists( FormPostType::POST_TYPE ) );
    }

    /**
     * `testBootRegistersThePostTypeOnInit()` above calls `do_action('init')`
     * and checks the observable result — but `WP_RUN_CORE_TESTS` is false
     * for plugin tests, so WordPress's `reset_post_types()` never runs
     * between tests. Once ANY earlier test (or `Plugin::boot()` itself,
     * which already ran once at `muplugins_loaded`) has registered the CPT,
     * `post_type_exists()` stays true for the rest of the process even if
     * the `add_action('init', ...)` line that is supposed to cause it is
     * deleted. `FormPostTypeTest` and both `FormsController*Test` fixtures
     * call `FormPostType::register()` directly and sort before this class,
     * so that mutation goes unnoticed here without this test.
     *
     * This asserts the hook registration itself, which does not depend on
     * test order or on the CPT ever having been registered by anything
     * else first.
     */
    public function testBootHooksFormPostTypeRegistrationToInit(): void
    {
        Plugin::boot();

        $this->assertNotFalse(
            has_action( 'init', [ FormPostType::class, 'register' ] ),
            'Plugin::boot() must hook FormPostType::register() to init.'
        );
    }

    /**
     * `RenderingTest::testTheShortcodeIsRegistered()` proves `[quoteform]`
     * responds once `Plugin::boot()` has run in a full WordPress request —
     * but not that `Plugin::boot()` is what puts it there, since nothing
     * un-registers shortcodes between tests. Asserting the hook directly
     * catches the `add_action( 'init', [ Shortcode::class, 'register' ] )`
     * line being deleted from `Plugin::boot()`, the same failure mode
     * `testBootHooksFormPostTypeRegistrationToInit()` guards against above.
     */
    public function testBootHooksShortcodeRegistrationToInit(): void
    {
        Plugin::boot();

        $this->assertNotFalse(
            has_action( 'init', [ Shortcode::class, 'register' ] ),
            'Plugin::boot() must hook Shortcode::register() to init.'
        );
    }

    /**
     * Same reasoning as `testBootHooksShortcodeRegistrationToInit()`: the
     * block's `render_callback` renders identically to the shortcode
     * (`RenderingSurfacesTest::testTheBlockProducesExactlyWhatTheShortcodeProduces()`),
     * but nothing un-registers block types between tests, so that alone
     * would not catch `add_action( 'init', [ Block::class, 'register' ] )`
     * being deleted from `Plugin::boot()`.
     */
    public function testBootHooksBlockRegistrationToInit(): void
    {
        Plugin::boot();

        $this->assertNotFalse(
            has_action( 'init', [ Block::class, 'register' ] ),
            'Plugin::boot() must hook Block::register() to init.'
        );
    }

    /**
     * Elementor announces itself before `init` fires (it hooks its own
     * bootstrap to `plugins_loaded`), so `ElementorWidget::register()` must
     * run on `plugins_loaded` to see `did_action( 'elementor/loaded' )`
     * true in time. Nothing else observably breaks if this hook is
     * deleted — Elementor is absent in this container — so it must be
     * asserted directly.
     */
    public function testBootHooksElementorWidgetRegistrationToPluginsLoaded(): void
    {
        Plugin::boot();

        $this->assertNotFalse(
            has_action( 'plugins_loaded', [ ElementorWidget::class, 'register' ] ),
            'Plugin::boot() must hook ElementorWidget::register() to plugins_loaded.'
        );
    }

    public function testBootRegistersTheRestRoutes(): void
    {
        Plugin::boot();

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();

        do_action( 'rest_api_init' );

        $this->assertArrayHasKey( '/quoteform/v1/forms', $wp_rest_server->get_routes() );
    }

    /**
     * `CapabilitiesTest` proves `Activation::activate()` grants the
     * capability when called directly — it never proves WordPress will ever
     * call it. Deleting the whole
     * `if ( defined( 'QFORM_FILE' ) ) { register_activation_hook(...); ... }`
     * block from `Plugin::boot()` leaves the rest of the suite green while
     * the plugin becomes entirely unusable on a real site: the
     * administrator never receives `qform_manage_forms`, and every route
     * 401s.
     *
     * `plugin_basename( QFORM_FILE )` is computed here the exact same way
     * `register_activation_hook()`/`register_deactivation_hook()` compute it
     * internally (they build the hook name as
     * `'activate_' . plugin_basename( $file )` / `'deactivate_' . ...`), so
     * this assertion is correct regardless of where the checkout happens to
     * sit relative to a real WordPress `wp-content/plugins` directory.
     */
    public function testBootRegistersActivationAndDeactivationHooks(): void
    {
        Plugin::boot();

        $activationHook   = 'activate_' . plugin_basename( QFORM_FILE );
        $deactivationHook = 'deactivate_' . plugin_basename( QFORM_FILE );

        $this->assertNotFalse(
            has_action( $activationHook, [ Activation::class, 'activate' ] ),
            'Plugin::boot() must register Activation::activate() on the activation hook.'
        );

        $this->assertNotFalse(
            has_action( $deactivationHook, [ Activation::class, 'deactivate' ] ),
            'Plugin::boot() must register Activation::deactivate() on the deactivation hook.'
        );
    }

    /**
     * `testBootIsIdempotent()` used to live here, calling `boot()` twice and
     * re-checking `post_type_exists()` — but that is exactly what
     * `testBootRegistersThePostTypeOnInit()` already checks (and is subject
     * to the same order-dependence explained on
     * `testBootHooksFormPostTypeRegistrationToInit()`), so it asserted
     * nothing of its own. The real idempotence claim — that calling
     * `boot()` again does not attach a second `rest_api_init` callback and
     * does not leave `/quoteform/v1/forms` with duplicate handlers — lives
     * here, folded into one test, plus the post-type check so nothing is
     * lost.
     *
     * Without `Plugin`'s internal `$booted` guard this would be observable:
     * `WP_REST_Server::register_route()` `array_merge()`s the handler list
     * of a route that is registered twice (when `$override` is false, the
     * default), so a second, redundant `rest_api_init` callback would leave
     * `/quoteform/v1/forms` with 4 handlers (GET+POST twice) instead of 2.
     */
    public function testBootCalledAgainDoesNotDuplicateHooksOrRoutes(): void
    {
        Plugin::boot();

        global $wp_filter;

        $countCallbacks = static function () use ( &$wp_filter ): int {
            if ( ! array_key_exists( 'rest_api_init', $wp_filter ) ) {
                return 0;
            }

            $total = 0;

            foreach ( $wp_filter['rest_api_init']->callbacks as $priorityCallbacks ) {
                $total += count( $priorityCallbacks );
            }

            return $total;
        };

        $callbackCountAfterFirstBoot = $countCallbacks();

        Plugin::boot();
        Plugin::boot();

        $this->assertSame(
            $callbackCountAfterFirstBoot,
            $countCallbacks(),
            'Calling boot() again must not attach a second rest_api_init callback.'
        );

        do_action( 'init' );

        $this->assertTrue(
            post_type_exists( FormPostType::POST_TYPE ),
            'Calling boot() again must not break post type registration.'
        );

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();

        do_action( 'rest_api_init' );

        $this->assertCount(
            2,
            $wp_rest_server->get_routes()['/quoteform/v1/forms'],
            'Extra boot() calls must not duplicate the handlers registered for a route.'
        );
    }

    /**
     * Uçdan-uca: forma yaradılır, sxem redaktə olunur, saxlanılır və geri
     * oxunur — hamısı REST üzərindən, builder-in edəcəyi kimi.
     *
     * Başlıqda və sxem sətrində qəsdən backslash və dırnaq istifadə olunur:
     * `update_post_meta()` bunları sözsüz `wp_slash()` tətbiq olunmadan
     * uda bilər (planın əvvəlki mərhələsində baş vermişdi) — round-trip'in
     * bayt-bəbayt eyni qalması bunu tutur.
     *
     * Sınıq düstur addımı planın əsas vədini kilidləyir: yalnış ifadə heç
     * vaxt bazaya düşmür (`SchemaValidator`/`Expression` mühərriki elə buna
     * görə var) — burada saxta uğurlu `SchemaValidator` bu testi qırar.
     */
    public function testEndToEndFormLifecycleOverRest(): void
    {
        FormPostType::register();
        Activation::activate();
        wp_set_current_user( $this->factory->user->create( [ 'role' => 'administrator' ] ) );

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        do_action( 'rest_api_init' );

        $title = 'Cleaning "deluxe" \\quote';

        // 1. Yarat
        $create = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $create->set_body_params( [ 'title' => $title ] );
        $created = $wp_rest_server->dispatch( $create );

        $this->assertSame( 201, $created->get_status() );
        $formId = $created->get_data()['id'];

        // 2. Siyahıda görünsün
        $list = $wp_rest_server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) )->get_data();
        $this->assertSame( [ $formId ], array_column( $list, 'id' ) );

        // 3. Sxemi redaktə et — otaq sayına görə qiymət
        $schema = SchemaRepository::defaults();
        $schema['fields']['quantity']['label']   = 'How many "rooms"? \\approx';
        $schema['calculations'][0]['expression'] = 'round({quantity} * 50, 2)';

        $update = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $update->set_body_params( [ 'title' => $title, 'schema' => $schema ] );

        $this->assertSame( 200, $wp_rest_server->dispatch( $update )->get_status() );

        // 4. Geri oxu — başlıq VƏ sxem, backslash/dırnaq toxunulmadan
        $read = $wp_rest_server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) );

        $this->assertSame( $title, $read->get_data()['title'] );
        $this->assertSame( 'How many "rooms"? \\approx', $read->get_data()['schema']['fields']['quantity']['label'] );

        // 5. Saxlanılmış ifadə mühərrikdə işləsin
        $this->assertSame(
            150.0,
            \Quoteform\Engine\Expression::evaluate(
                $read->get_data()['schema']['calculations'][0]['expression'],
                [ 'quantity' => 3.0 ]
            )
        );

        // 5b. Sınıq düstur: REST 400 qaytarmalı, bazaya HEÇ NƏ düşməməlidir.
        $brokenSchema = $schema;
        $brokenSchema['calculations'][0]['expression'] = 'round({quantity} * ';

        $brokenUpdate = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $brokenUpdate->set_body_params( [ 'title' => $title, 'schema' => $brokenSchema ] );

        $brokenResponse = $wp_rest_server->dispatch( $brokenUpdate );

        $this->assertSame( 400, $brokenResponse->get_status() );
        $this->assertSame( 'qform_invalid_schema', $brokenResponse->get_data()['code'] );

        $afterBrokenAttempt = $wp_rest_server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) );

        $this->assertSame(
            $schema,
            $afterBrokenAttempt->get_data()['schema'],
            'A rejected schema must not overwrite the previously-saved valid one.'
        );

        // 6. Sil
        $this->assertSame(
            200,
            $wp_rest_server->dispatch( new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/' . $formId ) )->get_status()
        );
        $this->assertSame( 'trash', get_post_status( $formId ) );

        // 6b. Silinmiş forma REST üzərindən görünməməlidir — birbaşa DB
        // statusu oxumaq `FormsController::getItem()`-in trash qapısını
        // yoxlamır.
        $afterDelete = $wp_rest_server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) );

        $this->assertSame( 404, $afterDelete->get_status() );
        $this->assertSame( 'qform_form_not_found', $afterDelete->get_data()['code'] );

        $listAfterDelete = $wp_rest_server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) )->get_data();
        $this->assertSame( [], array_column( $listAfterDelete, 'id' ) );
    }
}
