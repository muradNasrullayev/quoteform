<?php

declare(strict_types=1);

namespace Quoteform\Rendering;

/**
 * Elementor yalnız quraşdırılıbsa qeydiyyatdan keçir. `elementor/loaded`
 * baş verməyibsə sinif iyerarxiyası ümumiyyətlə mövcud deyil, ona görə
 * widget sinfi məhz qeydiyyat anında, funksiyanın içində elan olunur.
 */
final class ElementorWidget
{
    public static function register(): void
    {
        if ( ! did_action( 'elementor/loaded' ) ) {
            return;
        }

        add_action( 'elementor/widgets/register', [ self::class, 'registerWidget' ] );
    }

    /**
     * @param mixed $widgetsManager
     */
    public static function registerWidget( $widgetsManager ): void
    {
        require_once __DIR__ . '/elementor-widget-class.php';

        $widgetsManager->register( new \Quoteform\Rendering\Elementor\FormWidget() );
    }
}
