<?php

declare(strict_types=1);

namespace Quoteform\Tests;

use PHPUnit\Framework\TestCase;

/**
 * `.distignore` olmadan wp.org-a gedən arxiv bütün emalatxananı aparır:
 * `tests/`, `node_modules`, daxili planlar, mənbə qovluqları, konfiqlər.
 * Bu test həmin faylın həm MÖVCUD olduğunu, həm də hər iki istiqamətdə
 * doğru olduğunu saxlayır — çıxarılmalı olanlar çıxarılır, işləmək üçün
 * lazım olanlar isə arxivdə QALIR.
 */
final class PackagingTest extends TestCase
{
    /** @var string[] */
    private $lines = [];

    protected function setUp(): void
    {
        parent::setUp();

        $path = dirname( __DIR__, 2 ) . '/.distignore';

        $this->assertFileExists( $path, 'The release archive is defined by .distignore.' );

        $contents = (string) file_get_contents( $path );
        $lines    = [];

        foreach ( explode( "\n", $contents ) as $line ) {
            $line = trim( $line );

            if ( $line === '' || strpos( $line, '#' ) === 0 ) {
                continue;
            }

            $lines[] = $line;
        }

        $this->lines = $lines;
    }

    /**
     * @return array<int, array{0: string}>
     */
    public function developmentPathProvider(): array
    {
        return [
            [ '/tests' ],
            [ '/node_modules' ],
            [ '/admin-src' ],
            [ '/frontend-src' ],
            [ '/docs' ],
            [ '/.superpowers' ],
            [ '/bin' ],
            [ '/docker' ],
            [ '/package.json' ],
            [ '/jest.config.js' ],
            [ '/playwright.config.js' ],
            [ '/Makefile' ],
            [ '/phpunit.xml' ],
            [ '/docker-compose.yml' ],
            [ '/.idea' ],
        ];
    }

    /**
     * @dataProvider developmentPathProvider
     */
    public function testTheReleaseArchiveLeavesDevelopmentFilesBehind( string $path ): void
    {
        $this->assertContains(
            $path,
            $this->lines,
            sprintf( '%s would be published to every wp.org user.', $path )
        );
    }

    /**
     * @return array<int, array{0: string}>
     */
    public function shippedPathProvider(): array
    {
        return [
            [ '/build' ],
            [ '/includes' ],
            [ '/languages' ],
            [ '/vendor' ],
            [ '/quoteform.php' ],
            [ '/uninstall.php' ],
            [ '/readme.txt' ],
        ];
    }

    /**
     * `build/` repodadır, çünki istifadəçi tərəfində build pipeline yoxdur
     * (spec §20) — onu səhvən çıxarmaq plugini SƏSSİZCƏ işləməz edərdi.
     *
     * @dataProvider shippedPathProvider
     */
    public function testTheReleaseArchiveKeepsWhatThePluginNeedsToRun( string $path ): void
    {
        $this->assertNotContains(
            $path,
            $this->lines,
            sprintf( '%s is required at runtime and must stay in the archive.', $path )
        );
    }
}
