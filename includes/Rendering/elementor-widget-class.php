<?php

declare(strict_types=1);

namespace Quoteform\Rendering\Elementor;

use Elementor\Controls_Manager;
use Elementor\Widget_Base;
use Quoteform\Rendering\FormRenderer;

/**
 * `includes/Rendering/ElementorWidget.php` bu faylı yalnız `elementor/loaded`
 * baş verdikdən sonra tələb edir (`require_once`) — buna görə bu sinif PSR-4
 * ilə avtomatik yüklənmir: `Widget_Base`-i miras alan bir sinif Elementor
 * yoxdursa fayl heç açılmadan belə fatal xəta verər.
 */
final class FormWidget extends Widget_Base
{
    public function get_name(): string
    {
        return 'quoteform';
    }

    public function get_title(): string
    {
        return __( 'Quote form', 'quoteform' );
    }

    public function get_icon(): string
    {
        return 'eicon-form-horizontal';
    }

    /**
     * @return string[]
     */
    public function get_categories(): array
    {
        return [ 'general' ];
    }

    protected function register_controls(): void
    {
        $this->start_controls_section(
            'quoteform_section_content',
            [
                'label' => __( 'Content', 'quoteform' ),
            ]
        );

        $this->add_control(
            'formId',
            [
                'label'   => __( 'Form ID', 'quoteform' ),
                'type'    => Controls_Manager::NUMBER,
                'default' => 0,
                'min'     => 0,
                'step'    => 1,
            ]
        );

        $this->end_controls_section();
    }

    protected function render(): void
    {
        $formId = (int) $this->get_settings_for_display( 'formId' );

        if ( $formId < 1 ) {
            return;
        }

        $renderer = new FormRenderer();

        echo $renderer->render( $formId ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }
}
