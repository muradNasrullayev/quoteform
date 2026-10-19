<?php

declare(strict_types=1);

namespace Quoteform\Tests\Rendering;

use PHPUnit\Framework\TestCase;
use Quoteform\Rendering\SchemaFilter;

/**
 * Bu dəst WordPress YÜKLƏMİR, ona görə burdakı sxemdə `html` sahəsi yoxdur:
 * `SchemaFilter` `html` məzmununu `wp_kses_post()`-a verir və o funksiya yalnız
 * WordPress-in içində mövcuddur. Çıxışdakı təmizliyin əsl iddiası ona görə
 * inteqrasiya dəstindədir — `RenderingTest::testHtmlContentWrittenStraightTo…`
 * meta-ya birbaşa yazıb səhifəyə çatanı yoxlayır. Bura sanitizasiya üçün
 * saxta funksiya qoymaq həmin iddianı boş yerə "yaşıl" edərdi.
 */
final class SchemaFilterTest extends TestCase
{
    /**
     * @return array<string, mixed>
     */
    private function schema(): array
    {
        return [
            'version'  => 1,
            'settings' => [
                'currency'          => 'USD',
                'currency_position' => 'before',
                'decimals'          => 2,
                'submit_label'      => 'Get my quote',
                'success_action'    => 'message',
                'success_message'   => 'Thank you.',
                'redirect_url'      => 'https://example.com/thanks',
                'store_ip'          => true,
                'admin_note'        => 'internal only',
            ],
            'fields'        => [ 'rooms' => [ 'key' => 'rooms', 'type' => 'number', 'label' => 'Rooms' ] ],
            'steps'         => [ [ 'key' => 'step_one', 'title' => 'One', 'description' => '', 'fields' => [ 'rooms' ] ] ],
            'calculations'  => [
                [ 'key' => 'subtotal', 'expression' => '{rooms} * 50', 'label' => 'Subtotal', 'visible' => false ],
                [ 'key' => 'total', 'expression' => '{subtotal}', 'label' => 'Total', 'visible' => true ],
            ],
            'rules'         => [
                [
                    'target'     => [ 'kind' => 'field', 'key' => 'rooms' ],
                    'action'     => 'show',
                    'match'      => 'all',
                    'conditions' => [ [ 'field' => 'urgency', 'operator' => 'equals', 'value' => 'express' ] ],
                ],
            ],
            'notifications' => [
                [ 'to' => 'owner@example.com', 'subject' => 'New quote', 'body' => 'Internal template' ],
            ],
        ];
    }

    public function testKeepsWhatTheRendererNeeds(): void
    {
        $filtered = SchemaFilter::forDisplay( $this->schema() );

        $this->assertSame( 1, $filtered['version'] );
        $this->assertSame( $this->schema()['fields'], $filtered['fields'] );
        $this->assertSame( $this->schema()['steps'], $filtered['steps'] );
        $this->assertSame( $this->schema()['rules'], $filtered['rules'] );
    }

    public function testDropsNotificationsEntirely(): void
    {
        $filtered = SchemaFilter::forDisplay( $this->schema() );

        $this->assertArrayNotHasKey( 'notifications', $filtered );
    }

    public function testNoEmailAddressSurvivesAnywhere(): void
    {
        $encoded = json_encode( SchemaFilter::forDisplay( $this->schema() ) );

        $this->assertStringNotContainsString( 'owner@example.com', (string) $encoded );
        $this->assertStringNotContainsString( 'internal only', (string) $encoded );
    }

    public function testKeepsInvisibleCalculationsBecauseTotalDependsOnThem(): void
    {
        $filtered = SchemaFilter::forDisplay( $this->schema() );

        $this->assertCount( 2, $filtered['calculations'] );
        $this->assertSame( 'subtotal', $filtered['calculations'][0]['key'] );
        $this->assertFalse( $filtered['calculations'][0]['visible'] );
    }

    public function testKeepsOnlyDisplaySettings(): void
    {
        $settings = SchemaFilter::forDisplay( $this->schema() )['settings'];

        $this->assertSame(
            [ 'currency', 'currency_position', 'decimals' ],
            array_keys( $settings )
        );
    }

    public function testAnUnknownSettingDoesNotLeak(): void
    {
        $schema = $this->schema();
        $schema['settings']['secret_api_key'] = 'sk_live_xxx';

        $settings = SchemaFilter::forDisplay( $schema )['settings'];

        $this->assertArrayNotHasKey( 'secret_api_key', $settings );
    }

    public function testAnUnknownTopLevelKeyDoesNotLeak(): void
    {
        $schema = $this->schema();
        $schema['webhooks'] = [ [ 'url' => 'https://internal.example/hook' ] ];

        $filtered = SchemaFilter::forDisplay( $schema );

        $this->assertArrayNotHasKey( 'webhooks', $filtered );
    }

    public function testMissingSectionsBecomeEmptyRatherThanAbsent(): void
    {
        $filtered = SchemaFilter::forDisplay( [ 'version' => 1 ] );

        $this->assertSame( [], $filtered['fields'] );
        $this->assertSame( [], $filtered['steps'] );
        $this->assertSame( [], $filtered['calculations'] );
        $this->assertSame( [], $filtered['rules'] );
    }
}
