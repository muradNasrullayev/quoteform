<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\SettingsValidator;

final class SettingsValidatorTest extends TestCase
{
    /**
     * @return array<string, mixed>
     */
    private function validSettings(): array
    {
        return [
            'currency'          => 'USD',
            'currency_position' => 'before',
            'decimals'          => 2,
            'submit_label'      => 'Get my quote',
            'success_action'    => 'message',
            'success_message'   => 'Thanks.',
            'redirect_url'      => '',
            'save_resume'       => true,
            'store_ip'          => false,
        ];
    }

    /**
     * @param array<string, mixed> $overrides
     * @return string[]
     */
    private function codesFor( array $overrides ): array
    {
        $settings = array_merge( $this->validSettings(), $overrides );

        return array_column( ( new SettingsValidator() )->validate( $settings )->getErrors(), 'code' );
    }

    public function testValidSettingsProduceNoErrors(): void
    {
        $this->assertSame( [], $this->codesFor( [] ) );
    }

    public function testSettingsMustBeAnArray(): void
    {
        $result = ( new SettingsValidator() )->validate( 'not an array' );

        $this->assertSame( [ 'invalid_type' ], array_column( $result->getErrors(), 'code' ) );
    }

    public function testCurrencyMustBeThreeUppercaseLetters(): void
    {
        $this->assertSame( [ 'invalid_option' ], $this->codesFor( [ 'currency' => 'usd' ] ) );
        $this->assertSame( [ 'invalid_option' ], $this->codesFor( [ 'currency' => 'US' ] ) );
        $this->assertSame( [ 'invalid_option' ], $this->codesFor( [ 'currency' => 'USDD' ] ) );
        $this->assertSame( [], $this->codesFor( [ 'currency' => 'AZN' ] ) );
    }

    /**
     * PCRE's `$` matches before a trailing newline; JavaScript's does not, so
     * without the `D` modifier `"USD\n"` validated clean on PHP while carrying
     * a currency the JS engine would treat differently.
     */
    public function testCurrencyWithATrailingNewlineIsRejected(): void
    {
        $this->assertSame( [ 'invalid_option' ], $this->codesFor( [ 'currency' => "USD\n" ] ) );
        $this->assertSame( [ 'invalid_option' ], $this->codesFor( [ 'currency' => "USD\r\n" ] ) );
    }

    public function testCurrencyPositionIsRestricted(): void
    {
        $this->assertSame( [], $this->codesFor( [ 'currency_position' => 'after' ] ) );
        $this->assertSame( [ 'invalid_option' ], $this->codesFor( [ 'currency_position' => 'middle' ] ) );
    }

    public function testDecimalsMustBeAnIntegerBetweenZeroAndSix(): void
    {
        $this->assertSame( [], $this->codesFor( [ 'decimals' => 0 ] ) );
        $this->assertSame( [], $this->codesFor( [ 'decimals' => 6 ] ) );
        $this->assertSame( [ 'out_of_range' ], $this->codesFor( [ 'decimals' => 7 ] ) );
        $this->assertSame( [ 'out_of_range' ], $this->codesFor( [ 'decimals' => -1 ] ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( [ 'decimals' => '2' ] ) );
    }

    public function testDecimalsUpperBoundMatchesTheEnginesMaxPrecision(): void
    {
        // Functions::MAX_PRECISION 6-dır. Sxem daha böyük dəqiqlik tələb etsə,
        // forma işləyəndə invalid_precision atardı — bunu saxlama anında tuturuq.
        $this->assertSame( [ 'out_of_range' ], $this->codesFor( [ 'decimals' => 8 ] ) );
    }

    public function testSubmitLabelCannotBeEmpty(): void
    {
        $this->assertSame( [ 'missing_field' ], $this->codesFor( [ 'submit_label' => '' ] ) );
        $this->assertSame( [ 'missing_field' ], $this->codesFor( [ 'submit_label' => '   ' ] ) );
    }

    public function testSuccessActionIsRestricted(): void
    {
        $this->assertSame( [ 'invalid_option' ], $this->codesFor( [ 'success_action' => 'explode' ] ) );
    }

    public function testMessageActionRequiresAMessage(): void
    {
        $this->assertSame(
            [ 'missing_field' ],
            $this->codesFor( [ 'success_action' => 'message', 'success_message' => '' ] )
        );
    }

    public function testRedirectActionRequiresAValidUrl(): void
    {
        $this->assertSame(
            [ 'missing_field' ],
            $this->codesFor( [ 'success_action' => 'redirect', 'redirect_url' => '' ] )
        );

        $this->assertSame(
            [ 'invalid_option' ],
            $this->codesFor( [ 'success_action' => 'redirect', 'redirect_url' => 'not a url' ] )
        );

        $this->assertSame(
            [],
            $this->codesFor( [ 'success_action' => 'redirect', 'redirect_url' => 'https://example.com/thanks' ] )
        );
    }

    public function testRedirectUrlIsIgnoredWhenTheActionIsMessage(): void
    {
        $this->assertSame( [], $this->codesFor( [ 'success_action' => 'message', 'redirect_url' => 'nonsense' ] ) );
    }

    public function testSuccessMessageIsIgnoredWhenTheActionIsRedirect(): void
    {
        $this->assertSame(
            [],
            $this->codesFor(
                [
                    'success_action'  => 'redirect',
                    'success_message' => '',
                    'redirect_url'    => 'https://example.com/thanks',
                ]
            )
        );
    }

    /**
     * `FILTER_VALIDATE_URL` is not a scheme allowlist — `javascript://x%0aalert(1)`,
     * `file:///etc/passwd` and `ftp://a.b/c` all pass it (probed on PHP 7.4). The
     * `%0a` decodes to a newline, turning `//x` into a JavaScript line comment, so
     * `javascript://x%0aalert(1)` is the canonical bypass that runs on submission if
     * a renderer ever does `window.location = settings.redirect_url`.
     */
    public function testRedirectUrlRejectsDangerousSchemes(): void
    {
        $dangerous = [
            'javascript://x%0aalert(1)',
            'javascript:alert(1)',
            'data:text/html,<script>alert(1)</script>',
            'file:///etc/passwd',
            'ftp://a.b/c',
            'not a url',
        ];

        foreach ( $dangerous as $url ) {
            $this->assertSame(
                [ 'invalid_option' ],
                $this->codesFor( [ 'success_action' => 'redirect', 'redirect_url' => $url ] ),
                sprintf( 'Expected "%s" to be rejected.', $url )
            );
        }
    }

    public function testRedirectUrlAcceptsOrdinaryHttpAndHttpsUrls(): void
    {
        $safe = [
            'http://example.com/thanks',
            'https://example.com/thanks?ref=quoteform',
            'https://example.com:8443/thanks#done',
        ];

        foreach ( $safe as $url ) {
            $this->assertSame(
                [],
                $this->codesFor( [ 'success_action' => 'redirect', 'redirect_url' => $url ] ),
                sprintf( 'Expected "%s" to be accepted.', $url )
            );
        }
    }

    public function testBooleanFlagsMustBeBoolean(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( [ 'save_resume' => 'yes' ] ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( [ 'store_ip' => 1 ] ) );
    }

    public function testMissingKeysAreReported(): void
    {
        $settings = $this->validSettings();
        unset( $settings['currency'] );

        $result = ( new SettingsValidator() )->validate( $settings );

        $this->assertTrue( $result->hasErrorAt( 'currency' ) );
        $this->assertSame( 'missing_field', $result->getErrors()[0]['code'] );
    }

    public function testUnknownKeysAreReported(): void
    {
        $this->assertSame( [ 'unknown_key' ], $this->codesFor( [ 'colour' => 'blue' ] ) );
    }

    public function testAnUnknownKeyDoesNotSuppressValueLevelErrors(): void
    {
        $this->assertSame(
            [ 'unknown_key', 'invalid_option' ],
            $this->codesFor( [ 'colour' => 'blue', 'currency' => 'usd' ] )
        );
    }
}
