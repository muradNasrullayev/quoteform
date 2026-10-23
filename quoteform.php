<?php
/**
 * Plugin Name:       Quoteform
 * Plugin URI:        https://wordpress.org/plugins/quoteform/
 * Description:       Multi-step quote calculator and conditional logic forms. Free, with no paid upgrade.
 * Version:           0.1.1
 * Requires at least: 6.2
 * Requires PHP:      7.4
 * Author:            Murad Nasrullayev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       quoteform
 * Domain Path:       /languages
 *
 * @package Quoteform
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'QFORM_VERSION', '0.1.1' );
define( 'QFORM_FILE', __FILE__ );
define( 'QFORM_PATH', plugin_dir_path( __FILE__ ) );
define( 'QFORM_URL', plugin_dir_url( __FILE__ ) );

if ( ! file_exists( QFORM_PATH . 'vendor/autoload.php' ) ) {
	add_action(
		'admin_notices',
		static function (): void {
			echo '<div class="notice notice-error"><p>' . esc_html__(
				'Quoteform is missing its Composer dependencies (vendor/autoload.php). Run "composer install" in the plugin directory, then reload this page.',
				'quoteform'
			) . '</p></div>';
		}
	);

	return;
}

require_once QFORM_PATH . 'vendor/autoload.php';

Quoteform\Plugin::boot();
