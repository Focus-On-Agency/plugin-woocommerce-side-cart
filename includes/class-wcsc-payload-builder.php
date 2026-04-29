<?php
/**
 * Builds the payload localized into the Store API script (window.wcSideCart).
 *
 * @package WooCommerceSideCart
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WCSC_PayloadBuilder {
	/**
	 * @var WCSC_SettingsValidator
	 */
	private $settingsValidator;

	/**
	 * @var WCSC_HooksHtmlSanitizer
	 */
	private $hooksHtmlSanitizer;

	/**
	 * @param WCSC_SettingsValidator   $settingsValidator Settings validator.
	 * @param WCSC_HooksHtmlSanitizer  $hooksHtmlSanitizer HooksHtml sanitizer.
	 */
	public function __construct( $settingsValidator, $hooksHtmlSanitizer ) {
		$this->settingsValidator = $settingsValidator;
		$this->hooksHtmlSanitizer = $hooksHtmlSanitizer;
	}

	/**
	 * @param WC_Side_Cart $sideCart Side cart instance (for filters compatibility).
	 * @param array       $config Plugin config.
	 * @return array
	 */
	public function build( $sideCart, $config ) {
		$shopUrl = function_exists( 'wc_get_page_permalink' ) ? wc_get_page_permalink( 'shop' ) : home_url( '/' );
		$checkoutUrl = function_exists( 'wc_get_checkout_url' ) ? wc_get_checkout_url() : '';

		$hooksContext = array(
			'urls' => array(
				'cart' => function_exists( 'wc_get_cart_url' ) ? wc_get_cart_url() : '',
				'checkout' => $checkoutUrl,
				'shop' => $shopUrl,
			),
			'cart' => array(
				'count' => function_exists( 'WC' ) && WC()->cart ? (int) WC()->cart->get_cart_contents_count() : 0,
				'total' => function_exists( 'WC' ) && WC()->cart ? (string) WC()->cart->get_total( 'edit' ) : '',
				'subtotal' => function_exists( 'WC' ) && WC()->cart ? (string) WC()->cart->get_cart_subtotal() : '',
			),
		);

		$hooksHtml = isset( $config['hooksHtml'] ) && is_array( $config['hooksHtml'] ) ? $config['hooksHtml'] : array();
		$hooksHtml = apply_filters( 'wc_side_cart_hooks_html', $hooksHtml, $hooksContext, $sideCart );
		if ( ! is_array( $hooksHtml ) ) {
			$hooksHtml = array();
		}

		$hooksPolicy = isset( $config['hooksHtmlPolicy'] ) ? $config['hooksHtmlPolicy'] : 'post';
		$hooksPolicy = $this->hooksHtmlSanitizer->validatePolicy( $hooksPolicy, 'post' );

		$hooksOptions = isset( $config['hooksHtmlOptions'] ) ? $config['hooksHtmlOptions'] : array();
		$hooksHtmlSanitized = $this->hooksHtmlSanitizer->sanitizeMap( $hooksHtml, $hooksPolicy, $hooksOptions );

		$settings = $this->settingsValidator->buildClientSettings( $config, $hooksContext, $hooksHtmlSanitized );

		return array(
			'storeApiNonce' => wp_create_nonce( 'wc_store_api' ),
			'endpoints' => array(
				'cart' => rest_url( 'wc/store/v1/cart' ),
				'cartUpdateItem' => rest_url( 'wc/store/v1/cart/update-item' ),
				'cartRemoveItem' => rest_url( 'wc/store/v1/cart/remove-item' ),
				'cartApplyCoupon' => rest_url( 'wc/store/v1/cart/apply-coupon' ),
				'cartRemoveCoupon' => rest_url( 'wc/store/v1/cart/remove-coupon' ),
			),
			'urls' => array(
				'cart' => function_exists( 'wc_get_cart_url' ) ? wc_get_cart_url() : '',
				'checkout' => $checkoutUrl,
				'shop' => $shopUrl,
			),
			'nonces' => array(
				'cart' => wp_create_nonce( 'woocommerce-cart' ),
			),
			'settings' => $settings,
			'i18n' => array(
				'emptyCart' => __( 'Your cart is currently empty.', 'woocommerce' ),
				'viewCart' => __( 'View cart', 'woocommerce' ),
				'returnToShop' => __( 'Return to shop', 'woocommerce' ),
				'checkout' => __( 'Checkout', 'woocommerce' ),
				'subtotal' => __( 'Subtotal', 'woocommerce' ),
				'discount' => __( 'Discount', 'woocommerce' ),
				'total' => __( 'Total', 'woocommerce' ),
				'shipping' => __( 'Shipping', 'woocommerce' ),
				'taxes' => __( 'Tax', 'woocommerce' ),
				'remove' => __( 'Remove', 'woocommerce' ),
				'qty' => __( 'Qty', 'woocommerce' ),
				'couponToggle' => __( 'Have a coupon?', 'woocommerce' ),
				'couponPlaceholder' => __( 'Coupon code', 'woocommerce' ),
				'couponApply' => __( 'Apply coupon', 'woocommerce' ),
				'couponRemove' => __( 'Remove', 'woocommerce' ),
				'couponApplied' => __( 'Coupon code applied successfully.', 'woocommerce' ),
				'couponRemoved' => __( 'Coupon has been removed.', 'woocommerce' ),
				'couponError' => __( 'An error occurred.', 'woocommerce' ),
				'cartOpened' => __( 'Cart', 'woocommerce' ),
				'cartClosed' => __( 'Close', 'woocommerce' ),
				'cartUpdated' => __( 'Cart updated.', 'woocommerce' ),
				'cartError' => __( 'An error occurred.', 'woocommerce' ),
			),
		);
	}
}
