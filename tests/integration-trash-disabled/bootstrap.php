<?php
/**
 * Sibling bootstrap for the one scenario the normal integration suite
 * cannot exercise: a site where the WordPress Trash is disabled
 * (`EMPTY_TRASH_DAYS === 0`).
 *
 * `tests/integration/bootstrap.php` cannot cover this itself because
 * `EMPTY_TRASH_DAYS` is a PHP constant and, once WordPress core defines it,
 * cannot be redefined mid-process. But core only defines it *conditionally*
 * — `wp-includes/default-constants.php` does
 * `if ( ! defined( 'EMPTY_TRASH_DAYS' ) ) { define( 'EMPTY_TRASH_DAYS', 30 ); }`
 * — and this bootstrap runs *before* WordPress loads. So defining the
 * constant here first is honoured by core for the rest of the process.
 *
 * This file intentionally does not duplicate the normal bootstrap's logic:
 * it defines the one constant this suite exists to pin, then delegates to
 * `tests/integration/bootstrap.php` for everything else (locating
 * wordpress-tests-lib, wiring `muplugins_loaded`, loading WordPress).
 */

declare(strict_types=1);

if ( ! defined( 'EMPTY_TRASH_DAYS' ) ) {
	define( 'EMPTY_TRASH_DAYS', 0 );
}

require dirname( __DIR__ ) . '/integration/bootstrap.php';
