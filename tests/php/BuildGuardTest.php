<?php

declare(strict_types=1);

namespace Quoteform\Tests;

use PHPUnit\Framework\TestCase;

/**
 * `bin/check-build.sh` wp.org-a gedən `build/` qovluğunu `eval()` və
 * `Function()` çağırışlarına görə yoxlayır — bu, `readme.txt`-də istifadəçiyə
 * verilən vəddir və qadağan olunmuş konstruksiya ilə istifadəçinin saytı
 * arasındakı YEGANƏ avtomatik yoxlamadır.
 *
 * Yoxlamanın özünü qaçırmaq üçün tam webpack qurması lazımdır (dəqiqələr), ona
 * görə burada onun ŞABLONU skriptin özündən oxunur və həm tutmalı olduqları,
 * həm də tutmamalı olduqları üzərində sınanır. Şablon minifikasiya olunmuş
 * tək sətirlik bundle üzərində işləyir, yəni `evaluate(` kimi təsadüfi
 * uyğunluq həqiqi nasazlıq qədər ziyanlıdır: yalançı həyəcan bu yoxlamanı
 * söndürməyə təzyiq yaradır.
 */
final class BuildGuardTest extends TestCase
{
    /** @var string */
    private $script = '';

    /** @var string */
    private $pattern = '';

    protected function setUp(): void
    {
        parent::setUp();

        $path = dirname( __DIR__, 2 ) . '/bin/check-build.sh';

        $this->assertFileExists( $path, 'The build guard is bin/check-build.sh.' );

        $this->script = (string) file_get_contents( $path );

        $found = preg_match( "/^forbidden='(.+)'$/m", $this->script, $matches );

        $this->assertSame(
            1,
            $found,
            'The guard is expected to keep its pattern in a single `forbidden=` line, which this test reads.'
        );

        $this->pattern = $matches[1];
    }

    /**
     * @return array<string, array{0: string}>
     */
    public function forbiddenCalls(): array
    {
        return [
            'eval'                 => [ 'a=eval(s)' ],
            'eval with a space'    => [ 'a=eval (s)' ],
            'eval at the start'    => [ 'eval(s)' ],
            'eval on the global'   => [ 'window.eval(s)' ],
            'new Function'         => [ 'a=new Function(s)' ],
            'new Function spaced'  => [ 'a=new  Function (s)' ],
            // Məhz bu yazılış əvvəllər yoxlamadan keçirdi: `new` olmadan da
            // `Function(s)` eyni dinamik kodu qurur.
            'bare Function'        => [ 'a=Function(s)' ],
            'bare Function first'  => [ 'Function(s)' ],
            'Function on a global' => [ 'globalThis.Function(s)' ],
        ];
    }

    /**
     * @dataProvider forbiddenCalls
     */
    public function testTheGuardCatchesEveryWayOfBuildingCodeFromAString( string $code ): void
    {
        $this->assertSame(
            1,
            preg_match( '#' . $this->pattern . '#', $code ),
            sprintf( 'The build guard should refuse "%s".', $code )
        );
    }

    /**
     * @return array<string, array{0: string}>
     */
    public function innocentCode(): array
    {
        return [
            'our own evaluator'    => [ 'a=evaluate(node)' ],
            'a name ending in val' => [ 'a=retrieval(s)' ],
            'a prefixed eval'      => [ 'a=myeval(s)' ],
            'a suffixed Function'  => [ 'a=asFunction(s)' ],
            'a typeof test'        => [ 'if(typeof s==="function"){}' ],
            'Function borrowed'    => [ 'Function.prototype.call.bind(s)' ],
            'the word in text'     => [ 'x="This is evaluated later"' ],
        ];
    }

    /**
     * @dataProvider innocentCode
     */
    public function testTheGuardLeavesInnocentCodeAlone( string $code ): void
    {
        $this->assertSame(
            0,
            preg_match( '#' . $this->pattern . '#', $code ),
            sprintf( 'The build guard should not complain about "%s".', $code )
        );
    }

    /**
     * Şablon oxunur, lakin işlədilmirsə, test yaşıl qalıb heç nəyi qorumaz.
     */
    public function testTheGuardActuallyScansTheBuiltBundlesWithThatPattern(): void
    {
        $this->assertMatchesRegularExpression(
            '/grep\s+-l\s+-E\s+"\$forbidden"\s+build\/\*\.js/',
            $this->script,
            'The pattern is expected to be applied to the built JavaScript in build/.'
        );
    }

    /**
     * `readme.txt` hər iki adı çəkir. Yoxlama onlardan birini buraxsa, vəd
     * yalan olur — məhz D3-də baş verən bu idi.
     */
    public function testTheReadmePromisesNoMoreThanTheGuardChecks(): void
    {
        $readme = (string) file_get_contents( dirname( __DIR__, 2 ) . '/readme.txt' );

        $this->assertStringContainsString( '`Function()`', $readme );
        $this->assertSame( 1, preg_match( '#' . $this->pattern . '#', 'a=Function(s)' ) );
        $this->assertSame( 1, preg_match( '#' . $this->pattern . '#', 'a=eval(s)' ) );
    }
}
