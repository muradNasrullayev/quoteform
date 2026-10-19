<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Sxemin post meta-da saxlanması.
 *
 * Sxem massiv kimi saxlanılır, JSON sətri kimi yox: WordPress meta-nı özü
 * serialize edir və tipləri qoruyur. JSON sətri kimi saxlasaq, `true` ilə `1`
 * fərqi itər və sxem yenidən oxunanda validasiyadan keçməzdi.
 *
 * Massiv kimi saxlamaq özlüyündə dəyəri toxunulmaz saxlamır: `update_post_meta()`
 * ona verilən dəyərə `wp_unslash()` tətbiq edir, ona görə sxem əvvəlcə
 * `wp_slash()` ilə örtülmədən ötürülsə, hər sətirdəki bir backslash itər
 * (məsələn Windows yolu və ya regex-ə bənzər sətirlər zədələnər). `save()`
 * bunun qarşısını `wp_slash()` tətbiq edərək alır.
 */
final class SchemaRepository
{
    /**
     * Yeni formanın başlanğıc sxemi.
     *
     * Bu sxem `SchemaValidator`-dan keçməlidir — testi bunu yoxlayır.
     * Yeni forma ilk andan etibarlı olmalıdır, əks halda istifadəçi
     * heç nə etmədən xəta ekranı görər.
     *
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'version'  => SchemaValidator::CURRENT_VERSION,
            'settings' => [
                'currency'          => 'USD',
                'currency_position' => 'before',
                'decimals'          => 2,
                'submit_label'      => __( 'Get my quote', 'quoteform' ),
                'success_action'    => 'message',
                'success_message'   => __( 'Thanks — your quote is on the way.', 'quoteform' ),
                'redirect_url'      => '',
                'save_resume'       => true,
                'store_ip'          => false,
            ],
            'steps'    => [
                [
                    'key'         => 'step_one',
                    'title'       => __( 'Your details', 'quoteform' ),
                    'description' => '',
                    'fields'      => [ 'quantity' ],
                ],
            ],
            'fields'   => [
                'quantity' => [
                    'key'         => 'quantity',
                    'type'        => 'number',
                    'label'       => __( 'How many?', 'quoteform' ),
                    'help'        => '',
                    'placeholder' => '',
                    'required'    => true,
                    'default'     => 1,
                    'min'         => 1,
                    'max'         => 100,
                    'step'        => 1,
                ],
            ],
            'calculations' => [
                [
                    'key'        => 'total',
                    'expression' => 'round({quantity} * 100, 2)',
                    'label'      => __( 'Total', 'quoteform' ),
                    'visible'    => true,
                ],
            ],
            'rules'         => [],
            'notifications' => [],
        ];
    }

    /**
     * Distinguishes "no meta row" (returns `null`; defaults are the correct
     * behaviour) from "the meta row holds something that is not an array"
     * (throws `CorruptSchemaException`; the caller must not paper over this
     * with defaults — see that class's docblock).
     *
     * @return array<string, mixed>|null
     * @throws CorruptSchemaException
     */
    public function find( int $formId ): ?array
    {
        if ( ! $this->exists( $formId ) ) {
            return null;
        }

        if ( ! metadata_exists( 'post', $formId, FormPostType::META_SCHEMA ) ) {
            return null;
        }

        $schema = get_post_meta( $formId, FormPostType::META_SCHEMA, true );

        if ( ! is_array( $schema ) ) {
            throw new CorruptSchemaException( $formId ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- $formId is an int; the message is never printed.
        }

        return $schema;
    }

    /**
     * `update_post_meta()` `false` qaytardıqda bu ya dəyişməyən (uğurlu) bir
     * yenidən-yazma, ya da həqiqi yazma xətasıdır. İkisini ayırmaq üçün
     * saxlanmış dəyər yenidən oxunub `$schema` ilə müqayisə edilir.
     *
     * @param array<string, mixed> $schema
     */
    public function save( int $formId, array $schema ): bool
    {
        if ( ! $this->exists( $formId ) ) {
            return false;
        }

        if ( update_post_meta( $formId, FormPostType::META_SCHEMA, wp_slash( $schema ) ) ) {
            return true;
        }

        return get_post_meta( $formId, FormPostType::META_SCHEMA, true ) === $schema;
    }

    public function exists( int $formId ): bool
    {
        if ( $formId < 1 ) {
            return false;
        }

        $post = get_post( $formId );

        return $post !== null && $post->post_type === FormPostType::POST_TYPE;
    }
}
