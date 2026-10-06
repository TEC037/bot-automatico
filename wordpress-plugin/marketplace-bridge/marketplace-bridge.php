<?php
/**
 * Plugin Name: BuyaCar Marketplace Bridge & CRM Connector
 * Plugin URI:  https://buyacar.com.co
 * Description: Puente REST API y Webhooks entre WordPress / Vehica / WooCommerce y el Core de Automatización IA con Playwright para Facebook Marketplace, WhatsApp e Instagram.
 * Version:     2.0.0
 * Author:      BuyaCar Engineering Team
 * Text Domain: marketplace-bridge
 */

if (!defined('ABSPATH')) {
    exit; // Evitar acceso directo
}

class BuyaCarMarketplaceBridge {
    const API_NAMESPACE = 'marketplace-bridge/v1';

    public function __construct() {
        add_action('init', [$this, 'register_lead_cpt']);
        add_action('rest_api_init', [$this, 'register_rest_routes']);
        add_action('save_post', [$this, 'dispatch_stock_update_webhook'], 10, 3);
    }

    /**
     * Registra Custom Post Type 'mb_lead' para guardar prospectos directamente en el admin de WP
     */
    public function register_lead_cpt() {
        $labels = [
            'name'               => 'Leads Marketplace',
            'singular_name'      => 'Lead Marketplace',
            'menu_name'          => 'Leads IA BuyaCar',
            'add_new'            => 'Añadir Lead',
            'edit_item'          => 'Editar Lead',
            'all_items'          => 'Todos los Leads'
        ];

        $args = [
            'labels'             => $labels,
            'public'             => false,
            'show_ui'            => true,
            'show_in_menu'       => true,
            'menu_icon'          => 'dashicons-car',
            'capability_type'    => 'post',
            'hierarchical'       => false,
            'supports'           => ['title', 'editor', 'custom-fields'],
            'show_in_rest'       => true
        ];

        register_post_type('mb_lead', $args);
    }

    /**
     * Registra las rutas REST API públicas y seguras
     */
    public function register_rest_routes() {
        // GET /wp-json/marketplace-bridge/v1/products
        register_rest_route(self::API_NAMESPACE, '/products', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_products_endpoint'],
            'permission_callback' => '__return_true'
        ]);

        // POST /wp-json/marketplace-bridge/v1/lead
        register_rest_route(self::API_NAMESPACE, '/lead', [
            'methods'             => 'POST',
            'callback'            => [$this, 'create_lead_endpoint'],
            'permission_callback' => '__return_true'
        ]);
    }

    /**
     * Endpoint GET /products: Devuelve vehículos certificados listos para IA y catálogo
     */
    public function get_products_endpoint($request) {
        $args = [
            'post_type'      => ['car', 'product'],
            'post_status'    => 'publish',
            'posts_per_page' => 50
        ];

        $query = new WP_Query($args);
        $vehicles = [];

        if ($query->have_posts()) {
            while ($query->have_posts()) {
                $query->the_post();
                $id = get_the_ID();
                $price = get_post_meta($id, 'vehica_price', true) ?: get_post_meta($id, '_price', true);

                $vehicles[] = [
                    'id'             => 'WP-' . $id,
                    'name'           => get_the_title(),
                    'brand'          => get_post_meta($id, 'vehica_make', true) ?: 'BuyaCar',
                    'modelYear'      => (int)(get_post_meta($id, 'vehica_year', true) ?: 2022),
                    'mileageKm'      => (int)(get_post_meta($id, 'vehica_mileage', true) ?: 30000),
                    'priceCop'       => (float)($price ?: 85000000),
                    'formattedPrice' => '$' . number_format((float)($price ?: 85000000), 0, ',', '.') . ' COP',
                    'location'       => 'Tunja, Boyacá',
                    'url'            => get_permalink($id),
                    'featured_image' => get_the_post_thumbnail_url($id, 'large')
                ];
            }
            wp_reset_postdata();
        }

        return new WP_REST_Response([
            'status' => 'success',
            'count'  => count($vehicles),
            'cars'   => $vehicles
        ], 200);
    }

    /**
     * Endpoint POST /lead: Crea o actualiza prospectos desde el orquestador
     */
    public function create_lead_endpoint($request) {
        $params = $request->get_json_params();

        if (empty($params['chatId'])) {
            return new WP_REST_Response(['error' => 'chatId es requerido'], 400);
        }

        $chat_id  = sanitize_text_field($params['chatId']);
        $channel  = sanitize_text_field($params['channel'] ?? 'facebook_marketplace');
        $name     = sanitize_text_field($params['customerName'] ?? 'Prospecto ' . $chat_id);
        $stage    = sanitize_text_field($params['stage'] ?? 'PROSPECT');
        $score    = (int)($params['score'] ?? 20);
        $car_id   = sanitize_text_field($params['vehicleInterestId'] ?? '');

        // Crear Post en CPT mb_lead
        $post_id = wp_insert_post([
            'post_title'   => "[{$channel}] {$name} ({$chat_id})",
            'post_content' => "Lead generado automáticamente por BuyaCar AI Core.\nÚltimo mensaje: " . sanitize_textarea_field($params['lastMessageText'] ?? ''),
            'post_type'    => 'mb_lead',
            'post_status'  => 'publish'
        ]);

        if (is_wp_error($post_id)) {
            return new WP_REST_Response(['error' => $post_id->get_error_message()], 500);
        }

        update_post_meta($post_id, 'mb_chat_id', $chat_id);
        update_post_meta($post_id, 'mb_channel', $channel);
        update_post_meta($post_id, 'mb_stage', $stage);
        update_post_meta($post_id, 'mb_score', $score);
        update_post_meta($post_id, 'mb_vehicle_interest', $car_id);

        return new WP_REST_Response([
            'status'  => 'success',
            'lead_id' => $post_id,
            'message' => 'Lead registrado correctamente en WordPress.'
        ], 201);
    }

    /**
     * Webhook hacia NestJS Core cuando se actualiza o publica un auto
     */
    public function dispatch_stock_update_webhook($post_id, $post, $update) {
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (!in_array($post->post_type, ['car', 'product'])) return;

        $core_webhook_url = apply_filters('buyacar_core_webhook_url', 'http://127.0.0.1:3000/wordpress/webhook/stock-update');

        wp_remote_post($core_webhook_url, [
            'headers'     => ['Content-Type' => 'application/json'],
            'body'        => wp_json_encode([
                'event'     => 'stock_updated',
                'carId'     => $post_id,
                'title'     => $post->post_title,
                'timestamp' => current_time('mysql')
            ]),
            'timeout'     => 5,
            'blocking'    => false // No bloquear la interfaz del admin
        ]);
    }
}

new BuyaCarMarketplaceBridge();
