<?php

declare(strict_types=1);

namespace Quoteform\Tests;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\Functions;
use Quoteform\Rendering\Block;
use Quoteform\Rendering\Shortcode;
use Quoteform\Support\Capabilities;
use ReflectionClass;

/**
 * `readme.txt` wp.org resenzentinin OXUDUĞU İLK fayldır və eyni zamanda
 * pluginin istifadəçiyə verdiyi yeganə vəddir. Kod dəyişəndə o, səssizcə
 * yalana çevrilir — mühərrikə iki funksiya əlavə olunanda "səkkiz adlı
 * funksiya" cümləsi məhz belə qaldı.
 *
 * Ona görə burada sənədin ÜSLUBU yox, YOXLANA BİLƏN iddiaları saxlanılır:
 * funksiya siyahısı, üç yerləşdirmə səthi, silinmə nəticələri və ictimai
 * giriş nöqtəsi.
 */
final class ReadmeTest extends TestCase
{
    /** @var string */
    private $readme = '';

    protected function setUp(): void
    {
        parent::setUp();

        $path = dirname( __DIR__, 2 ) . '/readme.txt';

        $this->assertFileExists( $path );

        $this->readme = (string) file_get_contents( $path );
    }

    /**
     * @return string[]
     */
    private function engineFunctionNames(): array
    {
        $signatures = ( new ReflectionClass( Functions::class ) )
            ->getReflectionConstant( 'SIGNATURES' )
            ->getValue();

        // `if` şərti qiymətləndirmə olduğu üçün `Functions`-da deyil,
        // `Evaluator`-dadır — istifadəçi üçün isə eyni dərəcədə funksiyadır.
        return array_merge( [ 'if' ], array_keys( $signatures ) );
    }

    public function testEveryFunctionTheEngineHasIsNamedInTheReadme(): void
    {
        foreach ( $this->engineFunctionNames() as $name ) {
            $this->assertStringContainsString(
                '`' . $name . '`',
                $this->readme,
                sprintf( 'The readme does not mention the %s() function.', $name )
            );
        }
    }

    public function testTheReadmeCountsTheFunctionsCorrectly(): void
    {
        $written = [
            8  => 'eight named functions',
            9  => 'nine named functions',
            10 => 'ten named functions',
            11 => 'eleven named functions',
            12 => 'twelve named functions',
        ];

        $total = count( $this->engineFunctionNames() );

        $this->assertArrayHasKey( $total, $written, 'Spell the new total out in the readme.' );
        $this->assertStringContainsString( $written[ $total ], $this->readme );

        foreach ( $written as $count => $phrase ) {
            if ( $count !== $total ) {
                $this->assertStringNotContainsString( $phrase, $this->readme );
            }
        }
    }

    /**
     * Spec §11 üç yerləşdirmə səthi vəd edir. Readme onlardan birini
     * "hələ yoxdur" kimi təsvir edərsə, resenzent pluginin bacardığı işi
     * bacarmadığını oxuyur.
     */
    public function testTheReadmeTellsTheReaderHowToPutAFormOnThePage(): void
    {
        $this->assertStringContainsString( '[' . Shortcode::TAG . ' id="', $this->readme );
        $this->assertStringContainsString( 'block inserter', $this->readme );
        $this->assertStringContainsString( 'Elementor', $this->readme );
    }

    public function testTheReadmeNoLongerDeniesThatFormsCanBeShown(): void
    {
        $denials = [
            'no block and no front-end renderer',
            'Showing a saved form to visitors is not part of this release',
            'wait for a later version rather than installing this one',
        ];

        foreach ( $denials as $denial ) {
            $this->assertStringNotContainsString( $denial, $this->readme );
        }
    }

    /**
     * Silmək deaktivasiya deyil: hər forma və hər rol icazəsi gedir. Sayt
     * sahibi bunu Delete-ə basmazdan ƏVVƏL bilməlidir.
     */
    public function testTheReadmeSaysWhatDeletingThePluginDestroys(): void
    {
        foreach ( Capabilities::all() as $capability ) {
            $this->assertStringContainsString( $capability, $this->readme );
        }

        $this->assertStringContainsString( 'permanently', $this->readme );
        $this->assertStringContainsString( 'multisite', $this->readme );
    }

    public function testTheReadmeDocumentsThePublicBootEntryPoint(): void
    {
        $this->assertStringContainsString( 'window.quoteform.boot()', $this->readme );
    }

    public function testTheReadmeNamesTheBlockTheWayTheInserterDoes(): void
    {
        $metadata = json_decode(
            (string) file_get_contents( dirname( __DIR__, 2 ) . '/includes/Rendering/block.json' ),
            true
        );

        $this->assertIsArray( $metadata );
        $this->assertSame( Block::NAME, $metadata['name'] );
        $this->assertStringContainsString( $metadata['title'], $this->readme );
    }

    public function testTheStableTagMatchesThePluginHeader(): void
    {
        $plugin = (string) file_get_contents( dirname( __DIR__, 2 ) . '/quoteform.php' );

        $this->assertSame( 1, preg_match( '/^Stable tag:\s*(\S+)$/m', $this->readme, $readmeMatch ) );
        $this->assertSame( 1, preg_match( '/^\s*\*\s*Version:\s*(\S+)$/m', $plugin, $pluginMatch ) );
        $this->assertSame( $pluginMatch[1], $readmeMatch[1] );
    }
}
