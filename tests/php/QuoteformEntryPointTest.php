<?php

declare(strict_types=1);

/**
 * `.gitignore` excludes `/vendor/`, but `quoteform.php` used to
 * `require_once QFORM_PATH . 'vendor/autoload.php';` unconditionally. A fresh
 * `git clone` dropped into `wp-content/plugins/` — with no `composer install`
 * run yet — fatals on that line before WordPress can render so much as an
 * `admin_notices` warning: a white screen.
 *
 * This test reproduces exactly that: it copies the real `quoteform.php` into
 * a throwaway directory that deliberately has no `vendor/` subdirectory (a
 * stand-in for a fresh clone), then requires it there. WordPress itself is
 * not loaded in this suite (see `tests/php/bootstrap.php`), so the handful
 * of WordPress functions `quoteform.php` calls before handing off to the
 * autoloader are stubbed below, in the global namespace, scoped to this file
 * only — they are not added to the shared unit-test bootstrap because
 * nothing else needs them.
 */

namespace {
	if ( ! defined( 'ABSPATH' ) ) {
		define( 'ABSPATH', sys_get_temp_dir() . '/' );
	}

	if ( ! function_exists( 'plugin_dir_path' ) ) {
		function plugin_dir_path( string $file ): string { // phpcs:ignore
			return rtrim( dirname( $file ), '/' ) . '/';
		}
	}

	if ( ! function_exists( 'plugin_dir_url' ) ) {
		function plugin_dir_url( string $file ): string { // phpcs:ignore
			unset( $file );

			return 'http://example.test/wp-content/plugins/quoteform/';
		}
	}

	if ( ! function_exists( 'add_action' ) ) {
		/** @var array<int, array{0: string, 1: mixed}> */
		$GLOBALS['qform_test_recorded_actions'] = [];

		function add_action( string $hook, $callback ): void { // phpcs:ignore
			$GLOBALS['qform_test_recorded_actions'][] = [ $hook, $callback ];
		}
	}
}

namespace Quoteform\Tests {

	use PHPUnit\Framework\TestCase;

	final class QuoteformEntryPointTest extends TestCase
	{
		public function testAFreshCloneWithoutComposerDependenciesDoesNotFatal(): void
		{
			$fixtureDir = sys_get_temp_dir() . '/qform_entry_point_test_' . uniqid( '', true );
			mkdir( $fixtureDir );

			$source = dirname( __DIR__, 2 ) . '/quoteform.php';
			copy( $source, $fixtureDir . '/quoteform.php' );

			$this->assertDirectoryDoesNotExist( $fixtureDir . '/vendor', 'Fixture must have no vendor/ — that is the whole point.' );

			$GLOBALS['qform_test_recorded_actions'] = [];

			// If the guard in quoteform.php were missing, this line would
			// fatal on `require_once .../vendor/autoload.php` (no such file),
			// failing the test with an uncaught Error rather than an assertion.
			require $fixtureDir . '/quoteform.php';

			$this->assertTrue( defined( 'QFORM_PATH' ), 'The plugin header/constants must still be defined.' );
			$this->assertSame( $fixtureDir . '/', constant( 'QFORM_PATH' ) );

			$hooks = array_column( $GLOBALS['qform_test_recorded_actions'], 0 );
			$this->assertContains(
				'admin_notices',
				$hooks,
				'A missing vendor/autoload.php must register an admin notice, not fatal silently.'
			);

			$this->assertFalse(
				class_exists( 'Quoteform\\Plugin', false ),
				'Plugin::boot() must never run when the autoloader could not be loaded.'
			);

			unlink( $fixtureDir . '/quoteform.php' );
			rmdir( $fixtureDir );
		}
	}
}
