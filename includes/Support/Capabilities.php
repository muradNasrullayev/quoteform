<?php

declare(strict_types=1);

namespace Quoteform\Support;

/**
 * Pluginin öz capability-ləri.
 *
 * `manage_options`-a birbaşa bağlanmır (spec §10.2): sayt sahibi redaktora
 * yalnız entry görmə icazəsi verə bilməlidir, forma redaktəsi olmadan.
 */
final class Capabilities
{
    public const MANAGE_FORMS   = 'qform_manage_forms';
    public const VIEW_ENTRIES   = 'qform_view_entries';
    public const EXPORT_ENTRIES = 'qform_export_entries';

    /**
     * @return string[]
     */
    public static function all(): array
    {
        return [ self::MANAGE_FORMS, self::VIEW_ENTRIES, self::EXPORT_ENTRIES ];
    }

    public static function grantToAdministrator(): void
    {
        $role = get_role( 'administrator' );

        if ( ! $role instanceof \WP_Role ) {
            return;
        }

        foreach ( self::all() as $capability ) {
            $role->add_cap( $capability );
        }
    }

    public static function revokeFromAllRoles(): void
    {
        foreach ( wp_roles()->roles as $slug => $unused ) {
            $role = get_role( $slug );

            if ( ! $role instanceof \WP_Role ) {
                continue;
            }

            foreach ( self::all() as $capability ) {
                $role->remove_cap( $capability );
            }
        }
    }
}
