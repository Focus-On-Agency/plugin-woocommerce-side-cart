<?php
/**
 * Builds and validates the client settings payload.
 *
 * @package WooCommerceSideCart
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WCSC_SettingsValidator {
	/**
	 * @var WCSC_HooksHtmlSanitizer
	 */
	private $hooksHtmlSanitizer;

	/**
	 * @param WCSC_HooksHtmlSanitizer $hooksHtmlSanitizer HooksHtml sanitizer.
	 */
	public function __construct( $hooksHtmlSanitizer ) {
		$this->hooksHtmlSanitizer = $hooksHtmlSanitizer;
	}

	/**
	 * @param array $config Raw plugin config.
	 * @param array $hooksContext Context for theme hooks.
	 * @param array $hooksHtml Sanitized hooksHtml map.
	 * @return array
	 */
	public function buildClientSettings( $config, $hooksContext, $hooksHtml ) {
		if ( ! is_array( $config ) ) {
			$config = array();
		}

		$mode = isset( $config['mode'] ) ? strtolower( trim( (string) $config['mode'] ) ) : 'ui';
		if ( ! in_array( $mode, array( 'ui', 'headless' ), true ) ) {
			$mode = 'ui';
		}

		$taxDisplayCart = 'excl';
		if ( function_exists( 'get_option' ) ) {
			$taxDisplayCart = (string) get_option( 'woocommerce_tax_display_cart' );
		}
		$taxDisplayCart = strtolower( trim( $taxDisplayCart ) );
		if ( 'incl' !== $taxDisplayCart ) {
			$taxDisplayCart = 'excl';
		}
		$tax = array(
			'displayCart' => $taxDisplayCart,
		);

		$parityDefaults = array(
			'cartCheckoutGating' => 'removed',
			'onCartClickBehaviour' => 'open_drawer',
			'blocksSyncDebug' => false,
		);
		$parity = $parityDefaults;
		if ( isset( $config['parity'] ) && is_array( $config['parity'] ) ) {
			if ( isset( $config['parity']['cartCheckoutGating'] ) ) {
				$gating = strtolower( trim( (string) $config['parity']['cartCheckoutGating'] ) );
				if ( in_array( $gating, array( 'removed', 'hidden' ), true ) ) {
					$parity['cartCheckoutGating'] = $gating;
				}
			}

			if ( isset( $config['parity']['onCartClickBehaviour'] ) ) {
				$behaviour = strtolower( trim( (string) $config['parity']['onCartClickBehaviour'] ) );
				if ( in_array( $behaviour, array( 'open_drawer', 'navigate_to_checkout', 'navigate_to_cart', 'navigate_to_url' ), true ) ) {
					$parity['onCartClickBehaviour'] = $behaviour;
				}
			}

			if ( isset( $config['parity']['blocksSyncDebug'] ) ) {
				$parity['blocksSyncDebug'] = (bool) $config['parity']['blocksSyncDebug'];
			}
		}

		$dom = array( 'selectors' => array() );
		if ( isset( $config['dom'] ) && is_array( $config['dom'] ) && isset( $config['dom']['selectors'] ) && is_array( $config['dom']['selectors'] ) ) {
			$dom['selectors'] = $this->normalizeDomSelectors( $config['dom']['selectors'] );
		}

		$storeApiDefaults = array(
			'cacheBusting' => array(
				'enabled' => false,
				'param' => 'wcsc_cb',
				'strategy' => 'timestamp',
			),
		);
		$storeApi = $storeApiDefaults;
		if ( isset( $config['storeApi'] ) && is_array( $config['storeApi'] ) && isset( $config['storeApi']['cacheBusting'] ) && is_array( $config['storeApi']['cacheBusting'] ) ) {
			if ( isset( $config['storeApi']['cacheBusting']['enabled'] ) ) {
				$storeApi['cacheBusting']['enabled'] = (bool) $config['storeApi']['cacheBusting']['enabled'];
			}
			if ( isset( $config['storeApi']['cacheBusting']['param'] ) ) {
				$param = trim( (string) $config['storeApi']['cacheBusting']['param'] );
				if ( $param !== '' && strlen( $param ) <= 64 && preg_match( '/^[a-zA-Z0-9_-]+$/', $param ) ) {
					$storeApi['cacheBusting']['param'] = $param;
				}
			}
			if ( isset( $config['storeApi']['cacheBusting']['strategy'] ) ) {
				$strategy = strtolower( trim( (string) $config['storeApi']['cacheBusting']['strategy'] ) );
				if ( in_array( $strategy, array( 'timestamp', 'random' ), true ) ) {
					$storeApi['cacheBusting']['strategy'] = $strategy;
				}
			}
		}

		$uiDefaults = array(
			'showViewCartButton' => true,
			'showCheckoutButton' => true,
			'showItemRemove' => true,
			'showItemQuantity' => true,
			'enableQuantityEditing' => true,
			'showItemPrice' => true,
			'showItemThumbnail' => true,
			'showSubtotal' => true,
			'showShipping' => false,
			'showTaxes' => false,
			'showTotal' => false,
			'showCoupons' => false,
			'showFloatingCartIcon' => true,
			'openTriggerElementId' => '',
			'badgeElementId' => '',
			'autoOpenOnAddToCart' => false,
			'disableUiListeners' => false,
		);
		$ui = $uiDefaults;
		if ( isset( $config['ui'] ) && is_array( $config['ui'] ) ) {
			foreach ( array( 'showViewCartButton', 'showCheckoutButton', 'showItemRemove', 'showItemQuantity', 'enableQuantityEditing', 'showItemPrice', 'showItemThumbnail', 'showSubtotal', 'showShipping', 'showTaxes', 'showTotal', 'showCoupons', 'showFloatingCartIcon', 'autoOpenOnAddToCart', 'disableUiListeners' ) as $flag ) {
				if ( isset( $config['ui'][ $flag ] ) ) {
					$ui[ $flag ] = (bool) $config['ui'][ $flag ];
				}
			}
			foreach ( array( 'openTriggerElementId', 'badgeElementId' ) as $field ) {
				if ( isset( $config['ui'][ $field ] ) ) {
					$ui[ $field ] = (string) $config['ui'][ $field ];
				}
			}
		}

		$cssClasses = isset( $config['cssClasses'] ) && is_array( $config['cssClasses'] ) ? $config['cssClasses'] : array();

		// Ensure hooksHtml keys exist even if a filter returned a partial map.
		$hooksHtml = is_array( $hooksHtml ) ? $hooksHtml : array();
		$hooksHtml = array_merge(
			array(
				'aboveItems' => '',
				'afterActions' => '',
				'afterFirstItem' => '',
			),
			$hooksHtml
		);

		return array(
			'mode' => $mode,
			'tax' => $tax,
			'storeApi' => $storeApi,
			'parity' => $parity,
			'dom' => $dom,
			'ui' => $ui,
			'cssClasses' => $cssClasses,
			'hooksHtml' => $hooksHtml,
			'hooksContext' => is_array( $hooksContext ) ? $hooksContext : array(),
		);
	}

	/**
	 * @param array $selectors Raw selectors.
	 * @return array
	 */
	private function normalizeDomSelectors( $selectors ) {
		$allowedKeys = array(
			'panel',
			'backdrop',
			'container',
			'header',
			'form',
			'items',
			'footer',
			'totals',
			'item',
			'floatingIcon',
			'emptyTemplate',
			'toggle',
			'remove',
			'qtyInput',
			'stepperDec',
			'stepperInc',
		);

		$out = array();
		foreach ( $allowedKeys as $key ) {
			if ( isset( $selectors[ $key ] ) && is_string( $selectors[ $key ] ) ) {
				$value = trim( (string) $selectors[ $key ] );
				if ( $value !== '' ) {
					$out[ $key ] = $value;
				}
			}
		}

		return $out;
	}
}
