<?php

declare(strict_types=1);

namespace Quoteform\Entries;

/**
 * `{prefix}qform_entries` cədvəli (əsas spec §6.3 + `read_at`, yeni spec §6).
 *
 * Plugin yeniləndikdə aktivasiya hook-u İŞLƏMİR, ona görə versiya `init`-də
 * də yoxlanılır (`maybeUpgrade`, yalnız autoload option oxunuşu).
 */
final class EntriesTable
{
    public const VERSION = '1';
    public const OPTION  = 'qform_db_version';

    public static function name(): string
    {
        global $wpdb;

        return $wpdb->prefix . 'qform_entries';
    }

    public static function install(): void
    {
        global $wpdb;

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $table   = self::name();
        $charset = $wpdb->get_charset_collate();

        // dbDelta formatı: hər sütun ayrı sətirdə, PRIMARY KEY-dən sonra İKİ boşluq.
        // TEXT sütunlarında DEFAULT yazılmır — MySQL 8.0.13-dən əvvəl qəbul olunmur;
        // nullable `longtext` onsuz da NULL ilə başlayır.
        $sql = "CREATE TABLE {$table} (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  form_id bigint(20) unsigned NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  total decimal(18,4) DEFAULT NULL,
  currency char(3) NOT NULL DEFAULT 'USD',
  data longtext NOT NULL,
  breakdown longtext,
  resume_token char(32) DEFAULT NULL,
  current_step smallint(5) unsigned NOT NULL DEFAULT 0,
  user_id bigint(20) unsigned DEFAULT NULL,
  ip varbinary(16) DEFAULT NULL,
  user_agent varchar(255) DEFAULT NULL,
  read_at datetime DEFAULT NULL,
  created_at datetime NOT NULL,
  updated_at datetime NOT NULL,
  PRIMARY KEY  (id),
  KEY form_status (form_id,status),
  KEY status_read (status,read_at),
  KEY created (created_at),
  UNIQUE KEY resume (resume_token)
) {$charset};";

        dbDelta( $sql );

        // dbDelta uğursuzluğu bildirmir. Versiya cədvəl həqiqətən yarananda yazılır —
        // əks halda `maybeUpgrade` heç vaxt yenidən cəhd etməz və plugin cədvəlsiz qalar.
        if ( self::exists() ) {
            update_option( self::OPTION, self::VERSION );
        }
    }

    public static function exists(): bool
    {
        global $wpdb;

        // `SHOW TABLES` deyil: o TEMPORARY cədvəlləri göstərmir (WP test suite-i elə yaradır).
        // Cədvəl yoxdursa sorğu xəta verir — WP_DEBUG-da çap olunmasın deyə susdurulur.
        $suppressed = $wpdb->suppress_errors( true );
        $columns    = $wpdb->get_col( $wpdb->prepare( 'SHOW COLUMNS FROM %i', self::name() ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery -- checking the plugin's own table has no WordPress API.
        $wpdb->suppress_errors( $suppressed );

        return [] !== $columns;
    }

    public static function maybeUpgrade(): void
    {
        if ( self::VERSION !== get_option( self::OPTION ) ) {
            self::install();
        }
    }

    public static function drop(): void
    {
        global $wpdb;

        $wpdb->query( $wpdb->prepare( 'DROP TABLE IF EXISTS %i', self::name() ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery -- dropping the plugin's own table has no WordPress API.

        delete_option( self::OPTION );
    }

    /**
     * `wpmu_drop_tables`: sayt silinəndə onun müraciət cədvəli də silinir.
     *
     * @param string[] $tables
     * @return string[]
     */
    public static function dropTablesForSite( array $tables, int $blogId ): array
    {
        global $wpdb;

        $tables[] = $wpdb->get_blog_prefix( $blogId ) . 'qform_entries';

        return $tables;
    }
}
