<?php

declare(strict_types=1);

namespace Quoteform\Tests;

use PHPUnit\Framework\TestCase;

final class SmokeTest extends TestCase
{
    public function testAutoloaderIsAvailable(): void
    {
        $this->assertTrue( class_exists( \Composer\Autoload\ClassLoader::class ) );
    }

    public function testPhpVersionMeetsFloor(): void
    {
        $this->assertTrue( version_compare( PHP_VERSION, '7.4', '>=' ) );
    }
}
