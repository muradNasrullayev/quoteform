<?php

declare(strict_types=1);

namespace Quoteform\Tests\Runtime;

use PHPUnit\Framework\TestCase;
use Quoteform\Runtime\MoneyFormatter;

final class MoneyParityTest extends TestCase
{
    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public function caseProvider(): array
    {
        $decoded  = json_decode( (string) file_get_contents( __DIR__ . '/../../fixtures/money.json' ), true );
        $provided = [];

        foreach ( $decoded['cases'] as $case ) {
            $provided[ $case['id'] ] = [ $case ];
        }

        return $provided;
    }

    /**
     * @dataProvider caseProvider
     * @param array<string, mixed> $case
     */
    public function testFixtureCase( array $case ): void
    {
        $this->assertSame( $case['expect'], MoneyFormatter::format( $case['amount'], $case['settings'] ) );
    }

    public function testSeparatorsComeFromTheCaller(): void
    {
        $settings = [ 'currency' => 'EUR', 'currency_position' => 'after', 'decimals' => 2 ];

        $this->assertSame( '1.234,50 €', MoneyFormatter::format( 1234.5, $settings, '.', ',' ) );
    }
}
