<?php

declare(strict_types=1);

namespace Quoteform\Rest;

use Quoteform\Entries\EntryPreferences;
use Quoteform\Entries\EntryPresenter;
use Quoteform\Entries\EntryQuery;
use Quoteform\Entries\EntryRepository;
use Quoteform\Entries\FormDirectory;
use Quoteform\Support\Capabilities;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

/**
 * Admin müraciət ekranının REST-i (spec §2.4).
 *
 * İctimai `POST /entries`-ə (EntriesController) toxunmur: eyni route-a yeni
 * metodlar əlavə edir, WordPress onları birləşdirir və hər metodun öz
 * permission_callback-i olur. Filtrlər REST arqumenti kimi elan EDİLMİR:
 * etibarsız dəyər 400 yox, default olmalıdır — oxunuş EntryQuery::forSite()-dədir.
 */
final class EntriesAdminController
{
    public const MAX_BATCH = 100;

    public const SCOPE_FILTER = 'filter';

    /** Filtr-əhatəli toplu əməliyyatda DƏYƏRİ oxunmalı olan filtr açarları (sıralama təsirsizdir). */
    private const SCOPE_FILTER_KEYS = [ 'form', 'status', 'from', 'to', 'min', 'max' ];

    /** @var EntryRepository */
    private $entries;

    /** @var EntryPresenter */
    private $presenter;

    public function __construct( ?EntryRepository $entries = null, ?EntryPresenter $presenter = null )
    {
        $this->entries   = $entries ?? new EntryRepository();
        $this->presenter = $presenter ?? new EntryPresenter();
    }

    public function registerRoutes(): void
    {
        register_rest_route(
            FormsController::NAMESPACE,
            '/entries',
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'getItems' ],
                'permission_callback' => [ $this, 'canView' ],
            ]
        );

        register_rest_route(
            FormsController::NAMESPACE,
            '/entries/batch',
            [
                'methods'             => 'POST',
                'callback'            => [ $this, 'batch' ],
                'permission_callback' => [ $this, 'canBatch' ],
                'args'                => [
                    'action' => [
                        'type'     => 'string',
                        'required' => true,
                        'enum'     => [ 'read', 'unread', 'delete' ],
                    ],
                    // İki forma: `{ action, ids }` və ya `{ action, scope: 'filter', up_to_id, …filtrlər }`.
                    // Tam olaraq biri olmalıdır — bunu batch() yoxlayır (WordPress sxemi "biri" deyə bilmir).
                    'ids'      => [
                        'type'     => 'array',
                        'minItems' => 1,
                        'maxItems' => self::MAX_BATCH,
                        'items'    => [ 'type' => 'integer', 'minimum' => 1 ],
                    ],
                    'scope'    => [
                        'type' => 'string',
                        'enum' => [ self::SCOPE_FILTER ],
                    ],
                    'up_to_id' => [
                        'type'    => 'integer',
                        'minimum' => 1,
                    ],
                    // İstifadəçinin gördüyü say: server eyni əhatəni sayır, fərq varsa 409 (heç nə dəyişmir).
                    'expected_total' => [
                        'type'    => 'integer',
                        'minimum' => 0,
                    ],
                ],
            ]
        );

        register_rest_route(
            FormsController::NAMESPACE,
            '/entries/(?P<id>[\d]+)',
            [
                [
                    'methods'             => 'GET',
                    'callback'            => [ $this, 'getItem' ],
                    'permission_callback' => [ $this, 'canView' ],
                ],
                [
                    'methods'             => 'DELETE',
                    'callback'            => [ $this, 'deleteItem' ],
                    'permission_callback' => [ $this, 'canDelete' ],
                ],
            ]
        );
    }

    public function canView(): bool
    {
        return current_user_can( Capabilities::VIEW_ENTRIES );
    }

    public function canDelete(): bool
    {
        return current_user_can( Capabilities::MANAGE_FORMS );
    }

    public function canBatch( WP_REST_Request $request ): bool
    {
        return 'delete' === $request['action'] ? $this->canDelete() : $this->canView();
    }

    public function getItems( WP_REST_Request $request ): WP_REST_Response
    {
        $query   = EntryQuery::forSite( $request->get_query_params() );
        $perPage = $this->perPage( $request );
        $result  = $this->entries->listing( $query, max( 1, (int) $request->get_param( 'page' ) ), $perPage );
        $titles  = FormDirectory::titles( array_column( $result['items'], 'form_id' ) );
        $items   = [];

        foreach ( $result['items'] as $entry ) {
            $items[] = $this->presenter->listItem( $entry, $titles );
        }

        return new WP_REST_Response(
            [
                'items'    => $items,
                'total'    => $result['total'],
                'pages'    => $result['pages'],
                'page'     => $result['page'],
                'per_page' => $perPage,
                'unread'   => $this->entries->countUnread(),
                'max_id'   => $result['max_id'],
            ],
            200
        );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function getItem( WP_REST_Request $request )
    {
        $id = (int) $request['id'];

        // Oxunmamışdısa indi oxunur; təkrar açılış read_at-a toxunmur (markRead şərti).
        $this->entries->markRead( $id );

        $entry = $this->entries->findCompleted( $id );

        if ( null === $entry ) {
            return $this->notFound();
        }

        $query = EntryQuery::forSite( $request->get_query_params() );

        return new WP_REST_Response(
            array_merge(
                $this->presenter->detail( $entry, FormDirectory::titles( [ $entry['form_id'] ] ) ),
                [
                    'neighbours' => $this->entries->neighbours( $query, $entry ),
                    'unread'     => $this->entries->countUnread(),
                ]
            ),
            200
        );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function batch( WP_REST_Request $request )
    {
        $hasIds   = null !== $request['ids'];
        $hasScope = null !== $request['scope'];
        $hasUpTo  = null !== $request['up_to_id'];
        $hasTotal = null !== $request['expected_total'];

        if ( $hasIds === $hasScope || $hasScope !== $hasUpTo || $hasScope !== $hasTotal ) {
            return $this->invalidBatch();
        }

        if ( $hasScope ) {
            return $this->batchByFilter( $request );
        }

        $ids = array_values( array_unique( array_map( 'intval', (array) $request['ids'] ) ) );

        switch ( (string) $request['action'] ) {
            case 'delete':
                $affected = $this->entries->delete( $ids );
                break;
            case 'unread':
                $affected = $this->entries->setRead( $ids, false );
                break;
            default:
                $affected = $this->entries->setRead( $ids, true );
        }

        return new WP_REST_Response( [ 'affected' => $affected, 'unread' => $this->entries->countUnread() ], 200 );
    }

    /**
     * "Bu filtrə uyğun bütün müraciətlər": GET /entries ilə EYNİ filtr oxunuşu (EntryQuery::forSite)
     * + `id <= up_to_id` — siyahı yükləndikdən sonra gələn müraciət toxunulmaz qalır.
     *
     * @return WP_REST_Response|WP_Error
     */
    private function batchByFilter( WP_REST_Request $request )
    {
        $params = [];

        foreach ( array_merge( self::SCOPE_FILTER_KEYS, [ 'orderby', 'order' ] ) as $key ) {
            if ( null !== $request->get_param( $key ) ) {
                $params[ $key ] = $request->get_param( $key );
            }
        }

        $query   = EntryQuery::forSite( $params );
        $filters = $query->filters();

        // GET-də etibarsız filtr səssizcə default-a düşür (köhnə link siyahı göstərsin). Dağıdıcı
        // yolda isə bu, filtri GENİŞLƏDƏRDİ (`form=seven` → bütün formalar silinərdi): rədd edilir.
        foreach ( self::SCOPE_FILTER_KEYS as $key ) {
            if ( array_key_exists( $key, $params ) && null === $filters[ $key ] ) {
                return new WP_Error(
                    'qform_invalid_filter',
                    __( 'One of the filters could not be read, so nothing was changed. Reload the page and try again.', 'quoteform' ),
                    [ 'status' => 400, 'param' => $key ]
                );
            }
        }

        $upToId = (int) $request['up_to_id'];

        // Siyahı yükləndikdən sonra əhatə dəyişibsə (köhnə müraciət filtrə girib/çıxıb), istifadəçinin
        // təsdiqlədiyi say artıq doğru deyil: heç nəyə toxunmadan dayan.
        if ( $this->entries->countMatching( $query, $upToId ) !== (int) $request['expected_total'] ) {
            return new WP_Error(
                'qform_list_changed',
                __( 'The list changed. Review it and try again.', 'quoteform' ),
                [ 'status' => 409 ]
            );
        }

        switch ( (string) $request['action'] ) {
            case 'delete':
                $affected = $this->entries->deleteMatching( $query, $upToId );
                break;
            case 'unread':
                $affected = $this->entries->setReadMatching( $query, $upToId, false );
                break;
            default:
                $affected = $this->entries->setReadMatching( $query, $upToId, true );
        }

        return new WP_REST_Response( [ 'affected' => $affected, 'unread' => $this->entries->countUnread() ], 200 );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function deleteItem( WP_REST_Request $request )
    {
        $id = (int) $request['id'];

        if ( 0 === $this->entries->delete( [ $id ] ) ) {
            return $this->notFound();
        }

        return new WP_REST_Response( [ 'id' => $id, 'deleted' => true, 'unread' => $this->entries->countUnread() ], 200 );
    }

    private function perPage( WP_REST_Request $request ): int
    {
        $raw = $request->get_param( 'per_page' );

        if ( null === $raw || '' === $raw ) {
            return EntryPreferences::perPage( get_current_user_id() );
        }

        return EntryPreferences::save( get_current_user_id(), $raw );
    }

    private function invalidBatch(): WP_Error
    {
        return new WP_Error(
            'qform_invalid_batch',
            __( 'Send either a list of entries or a filter with its highest entry id and entry count — exactly one of the two.', 'quoteform' ),
            [ 'status' => 400 ]
        );
    }

    private function notFound(): WP_Error
    {
        return new WP_Error( 'qform_entry_not_found', __( 'Entry not found.', 'quoteform' ), [ 'status' => 404 ] );
    }
}
