<?php

declare(strict_types=1);

namespace Quoteform;

use Quoteform\Admin\BuilderPage;
use Quoteform\Admin\EntriesExport;
use Quoteform\Admin\EntriesPage;
use Quoteform\Entries\EntriesTable;
use Quoteform\Forms\FormPostType;
use Quoteform\Rendering\Block;
use Quoteform\Rendering\ElementorWidget;
use Quoteform\Rendering\Shortcode;
use Quoteform\Rest\EntriesAdminController;
use Quoteform\Rest\EntriesController;
use Quoteform\Rest\FormsController;
use Quoteform\Rest\SessionController;
use Quoteform\Support\Activation;

/**
 * Pluginin bootstrap-ı.
 *
 * Yalnız hook qeydiyyatı aparır — heç bir iş burada görülmür.
 * Aktivasiya hook-ları faylın yüklənməsi anında qeyd olunmalıdır,
 * `init`-də yox, çünki WordPress onları daha erkən çağırır.
 */
final class Plugin
{
    /** @var bool */
    private static $booted = false;

    public static function boot(): void
    {
        if ( self::$booted ) {
            return;
        }

        self::$booted = true;

        if ( defined( 'QFORM_FILE' ) ) {
            register_activation_hook( QFORM_FILE, [ Activation::class, 'activate' ] );
            register_deactivation_hook( QFORM_FILE, [ Activation::class, 'deactivate' ] );
        }

        add_action( 'init', [ FormPostType::class, 'register' ] );
        add_action( 'init', [ Shortcode::class, 'register' ] );
        add_action( 'init', [ Block::class, 'register' ] );
        add_action( 'init', [ EntriesTable::class, 'maybeUpgrade' ], 5 );
        add_action( 'wp_initialize_site', [ Activation::class, 'onNewSite' ], 20 );
        add_filter( 'wpmu_drop_tables', [ EntriesTable::class, 'dropTablesForSite' ], 10, 2 );
        add_action( 'plugins_loaded', [ ElementorWidget::class, 'register' ] );

        BuilderPage::register();
        EntriesPage::register();
        EntriesExport::register();

        add_action(
            'rest_api_init',
            static function (): void {
                ( new FormsController() )->registerRoutes();
                ( new SessionController() )->registerRoutes();
                ( new EntriesController() )->registerRoutes();
                // Eyni `/entries` route-una admin GET-i əlavə edir — ictimai POST-dan SONRA.
                ( new EntriesAdminController() )->registerRoutes();
            }
        );
    }
}
