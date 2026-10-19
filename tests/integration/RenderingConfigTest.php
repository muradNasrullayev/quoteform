<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Rendering\FormRenderer;
use WP_UnitTestCase;

final class RenderingConfigTest extends WP_UnitTestCase
{
    protected function tearDown(): void
    {
        wp_dequeue_script( FormRenderer::HANDLE );
        wp_deregister_script( FormRenderer::HANDLE );
        wp_dequeue_style( FormRenderer::HANDLE );
        wp_deregister_style( FormRenderer::HANDLE );
        parent::tearDown();
    }

    public function testThePageLearnsWhereTheRestApiIs(): void
    {
        FormPostType::register();
        $formId = self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => 'publish' ] );
        ( new SchemaRepository() )->save( $formId, SchemaRepository::defaults() );

        ( new FormRenderer() )->render( $formId );

        $inline = implode( "\n", (array) wp_scripts()->get_data( FormRenderer::HANDLE, 'before' ) );

        $this->assertStringContainsString( 'window.quoteformConfig', $inline );
        $this->assertStringContainsString( wp_json_encode( rest_url( 'quoteform/v1/' ) ), $inline );
    }

    /**
     * R11 (Fix round 1): `enqueue()` özü `wp_script_is( HANDLE, 'enqueued' )`
     * ilə erkən qayıdır, ona görə iki forma eyni səhifədə render olunanda
     * `window.quoteformConfig` YALNIZ birinci render-də əlavə olunmalıdır —
     * ikincisi təkrarlanmamalıdır.
     */
    public function testTheConfigIsPrintedOnlyOnceForTwoFormsOnOnePage(): void
    {
        FormPostType::register();
        $repository = new SchemaRepository();
        $firstId    = self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => 'publish' ] );
        $secondId   = self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => 'publish' ] );
        $repository->save( $firstId, SchemaRepository::defaults() );
        $repository->save( $secondId, SchemaRepository::defaults() );

        $renderer = new FormRenderer();
        $renderer->render( $firstId );
        $renderer->render( $secondId );

        // `substr_count()` üzərində sadəcə mətn axtarışı YARAMAZ: sətrin özü
        // (`window.quoteformConfig = window.quoteformConfig || {...}`)
        // idempotentlik üçün adı QƏSDƏN iki dəfə daşıyır. Ona görə "neçə
        // DƏFƏ növbəyə qoyulub" sualı boş elementləri kənar edib element
        // sayını yoxlamaqla verilir — mətn daxilindəki təkrarla qarışmır.
        $before = array_filter( (array) wp_scripts()->get_data( FormRenderer::HANDLE, 'before' ) );

        $this->assertCount( 1, $before );
        $this->assertStringContainsString( 'window.quoteformConfig', reset( $before ) );
    }
}
