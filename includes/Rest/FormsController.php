<?php

declare(strict_types=1);

namespace Quoteform\Rest;

use Quoteform\Forms\CorruptSchemaException;
use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Forms\SchemaSanitizer;
use Quoteform\Forms\SchemaValidator;
use Quoteform\Forms\ValidationResult;
use Quoteform\Support\Capabilities;
use WP_Error;
use WP_Post;
use WP_Query;
use WP_REST_Request;
use WP_REST_Response;

/**
 * Formaların REST interfeysi.
 *
 * Controller nazikdir: icazəni yoxlayır, repozitoriyanı çağırır, cavabı formalaşdırır.
 * Validasiya məntiqi burada deyil — o, `SchemaValidator`-dadır və WordPress-siz test edilir.
 */
final class FormsController
{
    public const NAMESPACE = 'quoteform/v1';

    private const DEFAULT_PER_PAGE = 20;
    private const MAX_PER_PAGE     = 100;

    /** @var SchemaRepository */
    private $repository;

    public function __construct( ?SchemaRepository $repository = null )
    {
        $this->repository = $repository ?? new SchemaRepository();
    }

    public function registerRoutes(): void
    {
        register_rest_route(
            self::NAMESPACE,
            '/forms',
            [
                [
                    'methods'             => 'GET',
                    'callback'            => [ $this, 'getItems' ],
                    'permission_callback' => [ $this, 'checkPermission' ],
                    'args'                => [
                        'page'     => [
                            'default'           => 1,
                            'sanitize_callback' => 'absint',
                            'validate_callback' => static function ( $value ) {
                                return is_numeric( $value ) && (int) $value >= 1;
                            },
                        ],
                        'per_page' => [
                            'default'           => self::DEFAULT_PER_PAGE,
                            'sanitize_callback' => 'absint',
                            'validate_callback' => static function ( $value ) {
                                return is_numeric( $value ) && (int) $value >= 1 && (int) $value <= self::MAX_PER_PAGE;
                            },
                        ],
                    ],
                ],
                [
                    'methods'             => 'POST',
                    'callback'            => [ $this, 'createItem' ],
                    'permission_callback' => [ $this, 'checkPermission' ],
                    'args'                => [
                        'title' => $this->titleArgSchema(),
                    ],
                ],
            ]
        );

        register_rest_route(
            self::NAMESPACE,
            '/forms/(?P<id>[\d]+)',
            [
                [
                    'methods'             => 'GET',
                    'callback'            => [ $this, 'getItem' ],
                    'permission_callback' => [ $this, 'checkPermission' ],
                    'args'                => [
                        'id' => $this->idArgSchema(),
                    ],
                ],
                [
                    'methods'             => 'PUT',
                    'callback'            => [ $this, 'updateItem' ],
                    'permission_callback' => [ $this, 'checkPermission' ],
                    'args'                => [
                        'id'     => $this->idArgSchema(),
                        'title'  => $this->titleArgSchema(),
                        'schema' => [
                            'required' => true,
                        ],
                    ],
                ],
                [
                    'methods'             => 'DELETE',
                    'callback'            => [ $this, 'deleteItem' ],
                    'permission_callback' => [ $this, 'checkPermission' ],
                    'args'                => [
                        'id' => $this->idArgSchema(),
                    ],
                ],
            ]
        );
    }

    /**
     * Shared by `createItem()`'s and `updateItem()`'s `title` argument: cheap,
     * side-effect-free checks only — WordPress runs these before the
     * permission callback, so nothing here may touch the database.
     *
     * This is not sufficient on its own: `sanitize_text_field` runs after
     * this validation and can turn a non-empty value into an empty one (e.g.
     * `<script>alert(1)</script>` strips to `''`). The handlers re-check the
     * sanitized value with `sanitizedTitle()`, which runs after
     * authorisation and after sanitization.
     *
     * @return array<string, mixed>
     */
    private function titleArgSchema(): array
    {
        return [
            'required'          => true,
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'validate_callback' => static function ( $value ) {
                return is_string( $value ) && trim( $value ) !== '';
            },
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function idArgSchema(): array
    {
        return [
            'required'          => true,
            'validate_callback' => static function ( $value ) {
                return is_numeric( $value ) && (int) $value > 0;
            },
        ];
    }

    public function checkPermission(): bool
    {
        return current_user_can( Capabilities::MANAGE_FORMS );
    }

    public function getItems( WP_REST_Request $request ): WP_REST_Response
    {
        $page    = max( 1, (int) $request->get_param( 'page' ) );
        $perPage = (int) $request->get_param( 'per_page' );

        if ( $perPage < 1 || $perPage > self::MAX_PER_PAGE ) {
            $perPage = self::DEFAULT_PER_PAGE;
        }

        $query = new WP_Query(
            [
                'post_type'        => FormPostType::POST_TYPE,
                'post_status'      => [ 'publish', 'draft' ],
                'posts_per_page'   => $perPage,
                'paged'            => $page,
                'orderby'          => 'modified',
                'order'            => 'DESC',
                'no_found_rows'    => false,
                'suppress_filters' => false,
            ]
        );

        $items = [];

        foreach ( $query->posts as $post ) {
            $items[] = [
                'id'       => (int) $post->ID,
                'title'    => $post->post_title,
                'modified' => mysql_to_rfc3339( $this->modifiedGmt( $post ) ),
            ];
        }

        $response = new WP_REST_Response( $items, 200 );
        $response->header( 'X-WP-Total', (string) $query->found_posts );
        $response->header( 'X-WP-TotalPages', (string) $query->max_num_pages );

        return $response;
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function getItem( WP_REST_Request $request )
    {
        $formId = (int) $request['id'];

        if ( ! $this->repository->exists( $formId ) ) {
            return $this->notFound();
        }

        if ( $this->isTrashed( $formId ) ) {
            return $this->notFound();
        }

        $post = get_post( $formId );

        try {
            $schema = $this->repository->find( $formId );
        } catch ( CorruptSchemaException $exception ) {
            return $this->corruptSchema();
        }

        return new WP_REST_Response(
            [
                'id'     => $formId,
                'title'  => $post->post_title,
                'schema' => $schema ?? SchemaRepository::defaults(),
            ],
            200
        );
    }

    /**
     * The stored schema is not an array — a truncated `maybe_unserialize()`, a
     * bad migration, a third-party meta write, a partially-failed update. The
     * value may still be recoverable, so the builder must refuse to save
     * rather than being handed `SchemaRepository::defaults()` and overwriting
     * it the moment the user presses Save.
     */
    private function corruptSchema(): WP_Error
    {
        return new WP_Error(
            'qform_schema_corrupt',
            __( 'This form\'s saved data could not be read. It has not been touched — contact support before making changes.', 'quoteform' ),
            [ 'status' => 500 ]
        );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function createItem( WP_REST_Request $request )
    {
        $title = $this->sanitizedTitle( $request );

        if ( $title instanceof WP_Error ) {
            return $title;
        }

        $formId = wp_insert_post(
            [
                'post_type'   => FormPostType::POST_TYPE,
                'post_title'  => wp_slash( $title ),
                'post_status' => 'publish',
            ],
            true
        );

        if ( is_wp_error( $formId ) ) {
            return new WP_Error(
                'qform_create_failed',
                __( 'The form could not be created.', 'quoteform' ),
                [ 'status' => 500 ]
            );
        }

        $schema = SchemaRepository::defaults();

        if ( ! $this->repository->save( (int) $formId, $schema ) ) {
            // The post is otherwise a fully-inserted, schema-less form —
            // an orphan the builder cannot show. Remove it so the failed
            // create leaves nothing behind, matching the atomicity already
            // guaranteed for a failed `wp_insert_post()` above.
            wp_delete_post( (int) $formId, true );

            return new WP_Error(
                'qform_create_failed',
                __( 'The form could not be created.', 'quoteform' ),
                [ 'status' => 500 ]
            );
        }

        return new WP_REST_Response(
            [
                'id'     => (int) $formId,
                'title'  => $title,
                'schema' => $schema,
            ],
            201
        );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function updateItem( WP_REST_Request $request )
    {
        $formId = (int) $request['id'];

        if ( ! $this->repository->exists( $formId ) || $this->isTrashed( $formId ) ) {
            return $this->notFound();
        }

        $title = $this->sanitizedTitle( $request );

        if ( $title instanceof WP_Error ) {
            return $title;
        }

        $schema = $request['schema'];

        if ( is_array( $schema ) && self::isSequentialList( $schema ) ) {
            return $this->invalidSchemaTypeError();
        }

        // Sanitisation runs BEFORE validation, not after, and the sanitised
        // value is what gets validated, stored AND returned. Reversing the
        // two would let a field whose `content` is nothing but a `<script>`
        // tag pass validation (non-empty), then be stripped to `''` on the
        // way to the database, leaving stored a document the validator would
        // have rejected. The document that is saved must be the document
        // that was validated.
        $schema = ( new SchemaSanitizer() )->sanitize( $schema );

        $result = ( new SchemaValidator() )->validate( $schema );

        if ( ! $result->isValid() ) {
            return new WP_Error(
                'qform_invalid_schema',
                __( 'The form could not be saved.', 'quoteform' ),
                [
                    'status' => 400,
                    'errors' => $result->getErrors(),
                ]
            );
        }

        // Checked, and failed on, BEFORE the schema is written: a failed
        // title update this way leaves nothing changed at all (the schema
        // write below never runs), which is a smaller inconsistent window
        // than writing the schema first and then risking a title failure
        // that would leave a new schema behind a stale title.
        $updated = wp_update_post(
            [
                'ID'         => $formId,
                'post_title' => wp_slash( $title ),
            ],
            true
        );

        if ( is_wp_error( $updated ) || ! $updated ) {
            return new WP_Error(
                'qform_update_failed',
                __( 'The form could not be saved.', 'quoteform' ),
                [ 'status' => 500 ]
            );
        }

        if ( ! $this->repository->save( $formId, $schema ) ) {
            return new WP_Error(
                'qform_update_failed',
                __( 'The form could not be saved.', 'quoteform' ),
                [ 'status' => 500 ]
            );
        }

        return new WP_REST_Response(
            [
                'id'     => $formId,
                'title'  => $title,
                'schema' => $schema,
            ],
            200
        );
    }

    /**
     * Runs after authorisation and after `sanitize_text_field` — the
     * `validate_callback` in `titleArgSchema()` only ever sees the raw
     * value, and `sanitize_text_field` (which strips tags) can turn a
     * non-empty raw value into an empty sanitized one, e.g.
     * `<script>alert(1)</script>` sanitizes to `''`.
     *
     * @return string|WP_Error
     */
    private function sanitizedTitle( WP_REST_Request $request )
    {
        $title = (string) $request['title'];

        if ( trim( $title ) === '' ) {
            return $this->invalidTitleError();
        }

        return $title;
    }

    /**
     * Same code/status/shape as the `rest_invalid_param` error WordPress
     * itself produces when `titleArgSchema()`'s `validate_callback` rejects
     * the raw value, so the builder sees one error shape for a bad title
     * regardless of which stage caught it.
     */
    private function invalidTitleError(): WP_Error
    {
        return new WP_Error(
            'rest_invalid_param',
            sprintf(
                /* translators: %s: parameter name. */
                __( 'Invalid parameter(s): %s', 'quoteform' ),
                'title'
            ),
            [
                'status' => 400,
                'params' => [ 'title' => __( 'title must be a non-empty string.', 'quoteform' ) ],
            ]
        );
    }

    /**
     * `SchemaValidator::validate()` only recognises "not an array" as
     * `invalid_type` (:27-31 there) — a sequential list (`[1, 2, 3]`) is
     * still an array, so it falls through into the key-presence checks and
     * comes back as a pile of `unknown_key`/`missing_field` errors instead.
     * WordPress's own `'type' => 'object'` schema can't be used to reject
     * this earlier either: `rest_is_object()` accepts any PHP array,
     * sequential or not. So the shape check happens here, producing the
     * exact envelope `SchemaValidator` would use for a non-array schema,
     * without needing to change that class.
     *
     * @param array<int|string, mixed> $schema
     */
    private static function isSequentialList( array $schema ): bool
    {
        return $schema !== [] && array_keys( $schema ) === range( 0, count( $schema ) - 1 );
    }

    private function invalidSchemaTypeError(): WP_Error
    {
        $result = new ValidationResult();
        $result->addError( '', 'invalid_type', __( 'A schema must be an object.', 'quoteform' ) );

        return new WP_Error(
            'qform_invalid_schema',
            __( 'The form could not be saved.', 'quoteform' ),
            [
                'status' => 400,
                'errors' => $result->getErrors(),
            ]
        );
    }

    /**
     * `deleteItem()` does not gate on `isTrashed()` the way `updateItem()`
     * must: an already-trashed form is still `exists()` (Task 12's
     * decision), and trashing it again is a harmless, idempotent no-op —
     * PROVIDED the Trash is enabled. It is NOT harmless otherwise: WordPress
     * core's own `wp_trash_post()` starts with
     * `if ( ! EMPTY_TRASH_DAYS ) { return wp_delete_post( $post_id, true ); }`,
     * so on a site that defines `EMPTY_TRASH_DAYS` as `0` (a documented,
     * widely used setting), this call would PERMANENTLY delete the form and
     * its schema — no trash, no undo — while still reporting
     * `{"deleted": true}` as if it had merely been trashed. So this method
     * mirrors what WordPress core's own posts controller does when the Trash
     * is unavailable: refuse rather than silently destroying data. DELETE is
     * otherwise still idempotent — a second call for an already-trashed form
     * returns 200, not 404 — as long as the Trash is enabled.
     *
     * @return WP_REST_Response|WP_Error
     */
    public function deleteItem( WP_REST_Request $request )
    {
        $formId = (int) $request['id'];

        if ( ! $this->repository->exists( $formId ) ) {
            return $this->notFound();
        }

        if ( ! $this->trashIsSupported() ) {
            return new WP_Error(
                'rest_trash_not_supported',
                __( 'The Trash is disabled on this site, so this form cannot be removed without a permanent, unrecoverable deletion. Enable the Trash (EMPTY_TRASH_DAYS) to delete forms.', 'quoteform' ),
                [ 'status' => 501 ]
            );
        }

        wp_trash_post( $formId );

        return new WP_REST_Response( [ 'id' => $formId, 'deleted' => true ], 200 );
    }

    /**
     * Mirrors WordPress core's own `EMPTY_TRASH_DAYS` gate
     * (`wp_trash_post()`'s `if ( ! EMPTY_TRASH_DAYS )` check).
     *
     * The constant-reading half and the decision itself are split on
     * purpose: `EMPTY_TRASH_DAYS` is already defined by the time any test
     * suite boots and cannot be redefined mid-process, and this class is
     * `final`, so nothing can override this method to fake the setting.
     * `isTrashEnabledFor()` below is the part that is actually pinned by a
     * test — see `FormsControllerTrashSupportTest`.
     */
    private function trashIsSupported(): bool
    {
        return self::isTrashEnabledFor( defined( 'EMPTY_TRASH_DAYS' ) ? (int) EMPTY_TRASH_DAYS : 30 );
    }

    /**
     * Deliberately narrower than WordPress core's own gate in
     * `wp_trash_post()`:
     *
     *     if ( ! EMPTY_TRASH_DAYS ) {
     *         return wp_delete_post( $post_id, true );
     *     }
     *
     * Core's check is plain PHP truthiness, so it treats *any* non-zero
     * value — including a negative one — as "Trash enabled". This method
     * instead requires a genuinely positive number of days
     * (`$emptyTrashDays > 0`), so `EMPTY_TRASH_DAYS = -1` is treated as
     * disabled here even though core itself would proceed to trash
     * normally under that same setting.
     *
     * That divergence is intentional, not an oversight: a negative
     * `EMPTY_TRASH_DAYS` is not a documented WordPress setting, and for a
     * data-loss guard like this one, failing closed (refusing with 501) on
     * an unexpected value is the safer default over mirroring core's
     * truthiness check byte-for-byte.
     */
    public static function isTrashEnabledFor( int $emptyTrashDays ): bool
    {
        return $emptyTrashDays > 0;
    }

    /**
     * A form that is in the trash still `exists()` (a restore flow needs to
     * read it), but it must not be served to REST callers as if it were a
     * live form. Task 14's `updateItem()`/`deleteItem()` need the same gate.
     */
    protected function isTrashed( int $formId ): bool
    {
        $post = get_post( $formId );

        return $post instanceof WP_Post && 'trash' === $post->post_status;
    }

    protected function notFound(): WP_Error
    {
        return new WP_Error(
            'qform_form_not_found',
            __( 'Form not found.', 'quoteform' ),
            [ 'status' => 404 ]
        );
    }

    /**
     * WordPress leaves `post_modified_gmt` as the zero-date on drafts. Mirror
     * core's own shim for this exact case (`WP_REST_Posts_Controller::prepare_item_for_response()`,
     * the `modified_gmt` branch) instead of feeding the zero-date into
     * `mysql_to_rfc3339()`, which would otherwise produce `-0001-11-30T00:00:00`.
     */
    private function modifiedGmt( WP_Post $post ): string
    {
        if ( '0000-00-00 00:00:00' !== $post->post_modified_gmt ) {
            return $post->post_modified_gmt;
        }

        return gmdate(
            'Y-m-d H:i:s',
            strtotime( $post->post_modified ) - (int) ( (float) get_option( 'gmt_offset' ) * HOUR_IN_SECONDS )
        );
    }
}
