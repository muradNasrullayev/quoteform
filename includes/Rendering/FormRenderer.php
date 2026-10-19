<?php

declare(strict_types=1);

namespace Quoteform\Rendering;

use Quoteform\Forms\CorruptSchemaException;
use Quoteform\Forms\SchemaRepository;
use WP_Post;

/**
 * Yeganə render yolu (spec §11). Shortcode, blok və Elementor widget-i
 * yalnız forma id-sini həll edib buranı çağırır; heç biri öz markup-unu
 * əlavə etmir.
 */
final class FormRenderer
{
    public const HANDLE = 'quoteform-renderer';

    /** @var array<int, bool> */
    private static $printed = [];

    /** @var SchemaRepository */
    private $repository;

    public function __construct( ?SchemaRepository $repository = null )
    {
        $this->repository = $repository ?? new SchemaRepository();
    }

    public function render( int $formId ): string
    {
        if ( ! $this->repository->exists( $formId ) ) {
            return '';
        }

        // `exists()` özü trash-dakı formanı da doğru sayır (restore axını
        // buna əsaslanır — `SchemaRepository::exists()` dəyişdirilmir), amma
        // trash-dakı forma ictimai səhifədə göstərilməməlidir. Qaralama
        // (draft) isə bunun əksinədir: səhifə önizləməsinin qanuni hissəsi
        // olduğu üçün rədd edilmir — yalnız trash rədd edilir.
        if ( $this->isTrashed( $formId ) ) {
            return '';
        }

        try {
            $schema = $this->repository->find( $formId );
        } catch ( CorruptSchemaException $exception ) {
            return '';
        }

        $schema  = $schema ?? SchemaRepository::defaults();
        $display = SchemaFilter::forDisplay( $schema );

        // `SchemaFilter::DISPLAY_SETTINGS` bilərəkdən göndərmə ilə bağlı
        // ayarları (uğur mesajı, yönləndirmə) buraxır — onlar göndəriş
        // CAVABINDA serverdən gəlir (bax `SubmissionService`), heç vaxt
        // öncədən schema ilə. `submit_label` isə fərqlidir: o, ziyarətçi
        // hələ heç nə göndərmədən görünən düymə mətnidir, ona görə
        // `SchemaFilter`-i buraxıb birbaşa ilkin sxemdən oxunur.
        $display['settings']['submit_label'] = self::submitLabel( $schema );

        $this->enqueue();
        $this->publishSchema( $formId, $display );

        return self::container( $formId );
    }

    private static function submitLabel( array $schema ): string
    {
        $settings = isset( $schema['settings'] ) && is_array( $schema['settings'] ) ? $schema['settings'] : [];
        $label    = isset( $settings['submit_label'] ) && is_string( $settings['submit_label'] ) ? trim( $settings['submit_label'] ) : '';

        return '' !== $label ? sanitize_text_field( $label ) : __( 'Get my quote', 'quoteform' );
    }

    public static function container( int $formId ): string
    {
        return sprintf(
            '<div class="quoteform_form" data-quoteform="%1$d"><noscript>%2$s</noscript></div>',
            $formId,
            esc_html__( 'This quote form needs JavaScript to calculate prices.', 'quoteform' )
        );
    }

    private function isTrashed( int $formId ): bool
    {
        $post = get_post( $formId );

        return $post instanceof WP_Post && 'trash' === $post->post_status;
    }

    private function enqueue(): void
    {
        if ( wp_script_is( self::HANDLE, 'enqueued' ) ) {
            return;
        }

        $assetFile = QFORM_PATH . 'build/frontend.asset.php';

        if ( ! file_exists( $assetFile ) ) {
            return;
        }

        /** @var array{dependencies: string[], version: string} $asset */
        $asset = require $assetFile;

        wp_enqueue_script( self::HANDLE, QFORM_URL . 'build/frontend.js', $asset['dependencies'], $asset['version'], true );
        wp_enqueue_style( self::HANDLE, QFORM_URL . 'build/style-frontend.css', [], $asset['version'] );
        wp_style_add_data( self::HANDLE, 'rtl', 'replace' );
        wp_set_script_translations( self::HANDLE, 'quoteform', QFORM_PATH . 'languages' );

        wp_add_inline_script(
            self::HANDLE,
            sprintf( 'window.quoteformConfig = window.quoteformConfig || { restUrl: %s };', (string) wp_json_encode( rest_url( 'quoteform/v1/' ) ) ),
            'before'
        );
    }

    /**
     * @param array<string, mixed> $schema
     */
    private function publishSchema( int $formId, array $schema ): void
    {
        if ( isset( self::$printed[ $formId ] ) ) {
            return;
        }

        self::$printed[ $formId ] = true;

        wp_add_inline_script(
            self::HANDLE,
            sprintf(
                'window.quoteformData = Object.assign( window.quoteformData || {}, %1$s );',
                (string) wp_json_encode( [ (string) $formId => $schema ] )
            ),
            'after'
        );
    }
}
