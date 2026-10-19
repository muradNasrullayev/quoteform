<?php

declare(strict_types=1);

namespace Quoteform\Forms;

use Quoteform\Support\Capabilities;

/**
 * Forma CPT-si.
 *
 * `show_ui` söndürülüb, çünki formalar öz React builder-imizdə redaktə olunur,
 * WordPress-in standart post redaktorunda yox. CPT yenə də seçilib (spec §6.1),
 * çünki trash/restore, revizyalar və capability sistemi hazır gəlir —
 * revizyalar xüsusilə dəyərlidir: sınıq formuldan geri qayıtmaq mümkün olur.
 */
final class FormPostType
{
    public const POST_TYPE   = 'quoteform';
    public const META_SCHEMA = '_qform_schema';

    public static function register(): void
    {
        register_post_type(
            self::POST_TYPE,
            [
                'label'               => __( 'Quote forms', 'quoteform' ),
                'public'              => false,
                'publicly_queryable'  => false,
                'show_ui'             => false,
                'show_in_menu'        => false,
                'show_in_rest'        => false,
                'exclude_from_search' => true,
                'hierarchical'        => false,
                'supports'            => [ 'title', 'revisions' ],
                'capability_type'     => 'post',
                'map_meta_cap'        => false,
                'capabilities'        => [
                    'edit_post'          => Capabilities::MANAGE_FORMS,
                    'read_post'          => Capabilities::MANAGE_FORMS,
                    'delete_post'        => Capabilities::MANAGE_FORMS,
                    'edit_posts'         => Capabilities::MANAGE_FORMS,
                    'edit_others_posts'  => Capabilities::MANAGE_FORMS,
                    'publish_posts'      => Capabilities::MANAGE_FORMS,
                    'read_private_posts' => Capabilities::MANAGE_FORMS,
                    'delete_posts'       => Capabilities::MANAGE_FORMS,
                ],
            ]
        );
    }
}
