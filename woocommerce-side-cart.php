<?php
/*
* Plugin Name: WooCommerce Side Cart
* Description: Lightweight side cart drawer powered by WooCommerce (Store API). Toggle via icon/menu link or a custom trigger element.
* Version: 3.0.0
* Author: Focus On
* Author URI: https://focuson.agency
*
* Copyright: © 2024-2026 Focus On
* License: GNU General Public License v3.0
* License URI: http://www.gnu.org/licenses/gpl-3.0.html
*/

// Exit if accessed directly
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WCSC_VERSION', '3.0.0' );
define( 'WCSC_PLUGIN_FILE', __FILE__ );
define( 'WCSC_PLUGIN_DIR', untrailingslashit( plugin_dir_path( __FILE__ ) ) );

require_once WCSC_PLUGIN_DIR . '/includes/class-wcsc-paths.php';
require_once WCSC_PLUGIN_DIR . '/includes/class-wcsc-config-loader.php';
require_once WCSC_PLUGIN_DIR . '/includes/class-wcsc-css-vars-sanitizer.php';
require_once WCSC_PLUGIN_DIR . '/includes/class-wcsc-hooks-html-sanitizer.php';
require_once WCSC_PLUGIN_DIR . '/includes/class-wcsc-settings-validator.php';
require_once WCSC_PLUGIN_DIR . '/includes/class-wcsc-payload-builder.php';

function wc_side_cart_activate() {
	$version = get_option( 'wc_side_cart_version', false );
	if ( $version === false ) {
		add_option( 'wc_side_cart_version', WCSC_VERSION );
		delete_option( 'woocommerce_composite_products_extension_active' );
		return;
	}
	if ( version_compare( (string) $version, WCSC_VERSION, '<' ) ) {
		update_option( 'wc_side_cart_version', WCSC_VERSION );
	}
}

function wc_side_cart_deactivate() {
	delete_option( 'wc_side_cart_version' );
}

function wc_side_cart_maybe_upgrade() {
	$legacy_version = get_option( 'woocommerce_side_cart_version', false );
	$version = get_option( 'wc_side_cart_version', false );
	if ( $legacy_version !== false && $version === false ) {
		add_option( 'wc_side_cart_version', $legacy_version );
		$version = $legacy_version;
	}
	if ( $legacy_version !== false ) {
		delete_option( 'woocommerce_side_cart_version' );
	}
	if ( $version === false ) {
		return;
	}
	if ( version_compare( (string) $version, WCSC_VERSION, '<' ) ) {
		update_option( 'wc_side_cart_version', WCSC_VERSION );
	}
}

register_activation_hook( WCSC_PLUGIN_FILE, 'wc_side_cart_activate' );
register_deactivation_hook( WCSC_PLUGIN_FILE, 'wc_side_cart_deactivate' );
add_action( 'plugins_loaded', 'wc_side_cart_maybe_upgrade', 5 );

function wc_side_cart_bootstrap() {
	if ( ! function_exists( 'WC' ) || ! class_exists( 'WooCommerce' ) ) {
		return;
	}
	$GLOBALS['wc_side_cart'] = new WC_Side_Cart();
}

add_action( 'woocommerce_loaded', 'wc_side_cart_bootstrap', 20 );


class WC_Side_Cart {
	
	public $version 	= WCSC_VERSION;
	private $config = null;
	private $paths = null;
	private $configLoader = null;
	private $cssVarsSanitizer = null;
	private $hooksHtmlSanitizer = null;
	private $payloadBuilder = null;
	
	public function __construct() {
		// Internal modules (keeps public hooks/filters unchanged).
		$this->paths = new WCSC_Paths( WCSC_PLUGIN_FILE );
		$this->configLoader = new WCSC_ConfigLoader( $this->paths );
		$this->cssVarsSanitizer = new WCSC_CssVarsSanitizer();
		$this->hooksHtmlSanitizer = new WCSC_HooksHtmlSanitizer();
		$settingsValidator = new WCSC_SettingsValidator( $this->hooksHtmlSanitizer );
		$this->payloadBuilder = new WCSC_PayloadBuilder( $settingsValidator, $this->hooksHtmlSanitizer );

		add_filter( 'rest_post_dispatch', array( $this, 'filter_store_api_cart_no_cache_headers' ), 10, 3 );
		
		// Enqueue Scripts
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_scripts' ) );
		
		// Enqueue Styles
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_styles' ) );

		add_filter( 'body_class', array( $this, 'filter_body_class' ) );
		
		// Backfall to default cart item filter
		add_filter( 'wc_side_cart_item_product', array( $this, 'side_cart_item_product' ), 10, 3 );
		add_filter( 'wc_side_cart_item_name', array( $this, 'side_cart_item_name' ), 10, 3 );
		add_filter( 'wc_side_cart_item_price', array( $this, 'side_cart_item_price' ), 10, 3 );
		
		// Controls
		add_action( 'wc_side_cart_after_product_title', array( $this, 'side_cart_item_controls' ), 10, 3 );
		
		// Add Side Menu to Action
		add_action( 'wp_footer', array( $this, 'render_side_cart' ) );
		add_action( 'wc_side_cart_before', array( $this, 'render_side_cart_open' ) );
				
	}
	
	public function enqueue_scripts() {
		
		if ( ! $this->should_display_side_cart() ) {
			return;
		}

		$suffix = defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG ? '' : '.min';
		if ( $suffix === '.min' && ! file_exists( $this->plugin_path() . '/assets/js/woocommerce_side_cart.min.js' ) ) {
			$suffix = '';
		}

		$dependencies = apply_filters( 'wc_side_cart_script_dependencies', array(), $this );
		if ( ! is_array( $dependencies ) ) {
			$dependencies = array();
		}

		$script_rel = '/assets/js/woocommerce_side_cart' . $suffix . '.js';
		$script_path = $this->plugin_path() . $script_rel;
		$script_version = $this->version;
		if ( file_exists( $script_path ) ) {
			$script_version = (string) filemtime( $script_path );
		}

		wp_enqueue_script( 'wc_side_cart', $this->plugin_url() . $script_rel, $dependencies, $script_version, true );

		wp_localize_script(
			'wc_side_cart',
			'wcSideCart',
			$this->get_store_api_script_data()
		);
		
	}
	
	public function enqueue_styles() {
		
		if ( ! $this->should_display_side_cart() ) {
			return;
		}

		$config = $this->get_config();
		$mode = isset( $config['mode'] ) ? strtolower( trim( (string) $config['mode'] ) ) : 'ui';
		if ( $mode === 'headless' ) {
			return;
		}

		$style_rel = '/assets/css/woocommerce_side_cart.base.css';
		$style_path = $this->plugin_path() . $style_rel;
		$style_version = $this->version;
		if ( file_exists( $style_path ) ) {
			$style_version = (string) filemtime( $style_path );
		}

		wp_enqueue_style( 'wc_side_cart', $this->plugin_url() . $style_rel, array(), $style_version );
		
		$inline_css = $this->get_css_vars_inline_style( $config );
		if ( $inline_css !== '' ) {
			wp_add_inline_style( 'wc_side_cart', $inline_css );
		}

		if ( $this->get_side_cart_visibility() === 'hidden' ) {
			wp_add_inline_style(
				'wc_side_cart',
				'body.wc-side-cart--hidden .side-cart, body.wc-side-cart--hidden .wc-side-cart-backdrop, body.wc-side-cart--hidden .js-side-cart-icon { display: none !important; }'
			);
		}
		
	}
	
	public function plugin_url() {
		return $this->paths->pluginUrl();
	}

	public function plugin_path() {
		return $this->paths->pluginPath();
	}

	public function templates_path() {
		return $this->paths->templatesPath( $this );
	}

	public function render_side_cart() {
		
		if ( ! $this->should_display_side_cart() ) {
			return;
		}

		$config = $this->get_config();
		$mode = isset( $config['mode'] ) ? strtolower( trim( (string) $config['mode'] ) ) : 'ui';
		if ( $mode === 'headless' ) {
			return;
		}

		wc_get_template(
			'cart/cart-aside.php',
			array(
				'side_cart_visibility' => $this->get_side_cart_visibility(),
			),
			false,
			$this->templates_path()
		);
		
	}
	
	public function render_side_cart_open() {
		
		$config = $this->get_config();
		$mode = isset( $config['mode'] ) ? strtolower( trim( (string) $config['mode'] ) ) : 'ui';
		if ( $mode === 'headless' ) {
			return;
		}
		if ( $this->get_side_cart_visibility() === 'hidden' ) {
			return;
		}
		wc_get_template( 'cart/cart-aside-open.php', array( 'side_cart_config' => $config ), false, $this->templates_path() );
    	
	}
	
	public function side_cart_item_product( $_product, $cart_item, $cart_item_key ) {
		
		return apply_filters('woocommerce_cart_item_product', $_product, $cart_item, $cart_item_key);
		
	}
	
	public function side_cart_item_name( $_name, $cart_item, $cart_item_key ) {
		
		return apply_filters('woocommerce_cart_item_name', $_name, $cart_item, $cart_item_key);
		
	}
	
	public function side_cart_item_price( $_price, $cart_item, $cart_item_key ) {
		
		return apply_filters('woocommerce_cart_item_price', $_price, $cart_item, $cart_item_key);
		
	}

	public function side_cart_item_controls( $_product, $cart_item, $cart_item_key ) {
		
		$args = array(
			'product' => $_product, 
			'cart_item' => $cart_item, 
			'cart_item_key' => $cart_item_key
		);
		
		wc_get_template( 'cart/cart-aside-item-controls.php', $args, false, $this->templates_path() );
		
	}

	private function should_display_side_cart() {
		
		if ( is_admin() ) {
			return false;
		}

		if ( ! (bool) apply_filters( 'wc_side_cart_enabled', true ) ) {
			return false;
		}
		
		$visibility = $this->get_side_cart_visibility();
		if ( $visibility === 'removed' ) {
			return false;
		}

		return true;
		
	}

	public function filter_body_class( $classes ) {
		if ( ! is_array( $classes ) ) {
			$classes = array();
		}

		if ( is_admin() ) {
			return $classes;
		}

		if ( ! (bool) apply_filters( 'wc_side_cart_enabled', true ) ) {
			return $classes;
		}

		if ( $this->get_side_cart_visibility() === 'hidden' ) {
			$classes[] = 'wc-side-cart--hidden';
		}

		return $classes;
	}

	private function get_cart_checkout_gating_mode() {
		$config = $this->get_config();
		$parity = ( isset( $config['parity'] ) && is_array( $config['parity'] ) ) ? $config['parity'] : array();
		$mode = isset( $parity['cartCheckoutGating'] ) ? strtolower( trim( (string) $parity['cartCheckoutGating'] ) ) : 'removed';
		if ( ! in_array( $mode, array( 'removed', 'hidden' ), true ) ) {
			$mode = 'removed';
		}
		return $mode;
	}

	private function get_side_cart_visibility() {
		if ( is_cart() ) {
			$enabled = (bool) apply_filters( 'wc_side_cart_display_on_cart', false );
			if ( $enabled ) {
				return 'normal';
			}
			return $this->get_cart_checkout_gating_mode();
		}

		if ( is_checkout() ) {
			$enabled = (bool) apply_filters( 'wc_side_cart_display_on_checkout', false );
			if ( $enabled ) {
				return 'normal';
			}
			return $this->get_cart_checkout_gating_mode();
		}

		return 'normal';
	}

	private function get_config() {
		
		if ( is_array( $this->config ) ) {
			return $this->config;
		}

		$this->config = $this->configLoader->loadConfig( $this );

		return $this->config;
		
	}
	
	private function get_css_vars_inline_style( $config ) {
		return $this->cssVarsSanitizer->buildInlineStyle( $config );
	}
	
	private function get_store_api_script_data() {
		$config = $this->get_config();

		$data = $this->payloadBuilder->build( $this, $config );

		if ( isset( $data['settings'] ) && is_array( $data['settings'] ) && $this->get_side_cart_visibility() === 'hidden' ) {
			if ( ! isset( $data['settings']['ui'] ) || ! is_array( $data['settings']['ui'] ) ) {
				$data['settings']['ui'] = array();
			}
			$data['settings']['ui']['autoOpenOnAddToCart'] = false;
			$data['settings']['ui']['disableUiListeners'] = true;
		}

		return apply_filters( 'wc_side_cart_store_api_script_data', $data, $this );
		
	}

	public function filter_store_api_cart_no_cache_headers( $result, $server, $request ) {
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		if ( ! is_object( $request ) || ! method_exists( $request, 'get_route' ) ) {
			return $result;
		}

		$route = $request->get_route();
		if ( ! is_string( $route ) ) {
			return $result;
		}
		if ( strpos( $route, '/wc/store/v1/cart' ) !== 0 ) {
			return $result;
		}

		$enabled = (bool) apply_filters( 'wc_side_cart_store_api_cart_no_cache', false, $request, $server, $this );
		if ( ! $enabled ) {
			return $result;
		}

		$defaultHeaders = array(
			'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
			'Pragma' => 'no-cache',
			'Expires' => '0',
		);
		$headers = apply_filters( 'wc_side_cart_store_api_cart_no_cache_headers', $defaultHeaders, $request, $server, $this );
		if ( ! is_array( $headers ) ) {
			return $result;
		}

		if ( is_object( $result ) && method_exists( $result, 'header' ) ) {
			foreach ( $headers as $name => $value ) {
				if ( ! is_string( $name ) || $name === '' ) {
					continue;
				}
				if ( ! is_scalar( $value ) ) {
					continue;
				}
				$result->header( $name, (string) $value );
			}
		}

		return $result;
	}
	
}
