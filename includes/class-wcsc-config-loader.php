<?php
/**
 * Loads and validates the plugin configuration.
 *
 * @package WooCommerceSideCart
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WCSC_ConfigLoader {
	/**
	 * @var WCSC_Paths
	 */
	private $paths;

	/**
	 * @param WCSC_Paths $paths Paths resolver.
	 */
	public function __construct( $paths ) {
		$this->paths = $paths;
	}

	/**
	 * @param WC_Side_Cart $sideCart Side cart instance (for filters compatibility).
	 * @return array
	 */
	public function loadConfig( $sideCart ) {
		$defaults = $this->getDefaults();

		$configPaths = array(
			WP_CONTENT_DIR . '/woocommerce-side-cart.config.json',
			WP_CONTENT_DIR . '/woocommerce-side-cart.config.php',
			get_stylesheet_directory() . '/woocommerce-side-cart.config.json',
			get_stylesheet_directory() . '/woocommerce-side-cart.config.php',
			$this->paths->pluginPath() . '/woocommerce-side-cart.config.json',
			$this->paths->pluginPath() . '/woocommerce-side-cart.config.php',
		);

		$configPath = apply_filters( 'wc_side_cart_config_path', '', $sideCart );
		if ( is_string( $configPath ) && $configPath !== '' ) {
			array_unshift( $configPaths, $configPath );
		}

		$configPaths = apply_filters( 'wc_side_cart_config_paths', $configPaths, $sideCart );
		if ( ! is_array( $configPaths ) ) {
			$configPaths = array();
		}

		$configFromFile = array();
		foreach ( $configPaths as $candidatePath ) {
			$loaded = $this->loadConfigFromPath( $candidatePath );
			if ( is_array( $loaded ) && ! empty( $loaded ) ) {
				$configFromFile = $loaded;
				break;
			}
		}

		$config = $this->mergeFileConfig( $defaults, $configFromFile );

		$config = apply_filters( 'wc_side_cart_config', $config, $sideCart );
		if ( ! is_array( $config ) ) {
			$config = $defaults;
		}

		// Final validation after filters to keep settings deterministic and safe.
		$config = $this->validateConfig( $config, $defaults );

		return $config;
	}

	/**
	 * @return array
	 */
	private function getDefaults() {
		return array(
			'mode' => 'ui',
			'storeApi' => array(
				'cacheBusting' => array(
					'enabled' => false,
					'param' => 'wcsc_cb',
					'strategy' => 'timestamp',
				),
			),
			'dom' => array(
				'selectors' => array(),
			),
			'parity' => array(
				'cartCheckoutGating' => 'removed',
				'onCartClickBehaviour' => 'open_drawer',
				'blocksSyncDebug' => false,
			),
			'ui' => array(
				'showViewCartButton' => true,
				'showCheckoutButton' => true,
				'showItemRemove' => true,
				'showItemQuantity' => true,
				'enableQuantityEditing' => true,
				'showItemLinks' => true,
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
			),
			'cssVars' => array(),
			'cssClasses' => array(),
			'hooksHtml' => array(
				'aboveItems' => '',
				'afterActions' => '',
				'afterFirstItem' => '',
			),
			// Controls hooksHtml injection without changing the existing public API.
			'hooksHtmlOptions' => array(
				'enabled' => true,
				'maxLength' => 5000,
			),
			// Default MUST remain "post" for backward compatibility.
			'hooksHtmlPolicy' => 'post',
		);
	}

	/**
	 * @param mixed $candidatePath Candidate config file path.
	 * @return bool
	 */
	private function isValidConfigPath( $candidatePath ) {
		if ( ! is_string( $candidatePath ) ) {
			return false;
		}
		$candidatePath = trim( $candidatePath );
		if ( $candidatePath === '' ) {
			return false;
		}
		if ( strpos( $candidatePath, "\0" ) !== false ) {
			return false;
		}
		if ( ! file_exists( $candidatePath ) || ! is_file( $candidatePath ) || ! is_readable( $candidatePath ) ) {
			return false;
		}
		return true;
	}

	/**
	 * @param mixed $candidatePath Candidate config file path.
	 * @return array
	 */
	private function loadConfigFromPath( $candidatePath ) {
		if ( ! $this->isValidConfigPath( $candidatePath ) ) {
			return array();
		}

		$lower = strtolower( $candidatePath );
		if ( substr( $lower, -5 ) === '.json' ) {
			$raw = file_get_contents( $candidatePath );
			if ( ! is_string( $raw ) || trim( $raw ) === '' ) {
				return array();
			}
			$decoded = json_decode( $raw, true );
			if ( json_last_error() !== JSON_ERROR_NONE || ! is_array( $decoded ) ) {
				return array();
			}
			return $decoded;
		}

		$loaded = include $candidatePath;
		if ( is_array( $loaded ) ) {
			return $loaded;
		}
		return array();
	}

	/**
	 * @param array $defaults Plugin defaults.
	 * @param array $configFromFile Raw config loaded from file.
	 * @return array
	 */
	private function mergeFileConfig( $defaults, $configFromFile ) {
		$config = $defaults;

		if ( isset( $configFromFile['storeApi'] ) && is_array( $configFromFile['storeApi'] ) ) {
			if ( isset( $configFromFile['storeApi']['cacheBusting'] ) && is_array( $configFromFile['storeApi']['cacheBusting'] ) ) {
				if ( isset( $configFromFile['storeApi']['cacheBusting']['enabled'] ) ) {
					$config['storeApi']['cacheBusting']['enabled'] = (bool) $configFromFile['storeApi']['cacheBusting']['enabled'];
				}
				if ( isset( $configFromFile['storeApi']['cacheBusting']['param'] ) ) {
					$config['storeApi']['cacheBusting']['param'] = (string) $configFromFile['storeApi']['cacheBusting']['param'];
				}
				if ( isset( $configFromFile['storeApi']['cacheBusting']['strategy'] ) ) {
					$config['storeApi']['cacheBusting']['strategy'] = (string) $configFromFile['storeApi']['cacheBusting']['strategy'];
				}
			}
		}

		if ( isset( $configFromFile['parity'] ) && is_array( $configFromFile['parity'] ) ) {
			if ( isset( $configFromFile['parity']['cartCheckoutGating'] ) ) {
				$config['parity']['cartCheckoutGating'] = (string) $configFromFile['parity']['cartCheckoutGating'];
			}
			if ( isset( $configFromFile['parity']['onCartClickBehaviour'] ) ) {
				$config['parity']['onCartClickBehaviour'] = (string) $configFromFile['parity']['onCartClickBehaviour'];
			}
			if ( isset( $configFromFile['parity']['blocksSyncDebug'] ) ) {
				$config['parity']['blocksSyncDebug'] = (bool) $configFromFile['parity']['blocksSyncDebug'];
			}
		}

		if ( isset( $configFromFile['ui'] ) && is_array( $configFromFile['ui'] ) ) {
			if ( isset( $configFromFile['ui']['showViewCartButton'] ) ) {
				$config['ui']['showViewCartButton'] = (bool) $configFromFile['ui']['showViewCartButton'];
			}
			foreach ( array( 'showCheckoutButton', 'showItemRemove', 'showItemQuantity', 'showItemLinks', 'showItemPrice', 'showItemThumbnail', 'showSubtotal', 'showShipping', 'showTaxes', 'showTotal', 'showCoupons' ) as $flag ) {
				if ( isset( $configFromFile['ui'][ $flag ] ) ) {
					$config['ui'][ $flag ] = (bool) $configFromFile['ui'][ $flag ];
				}
			}
			if ( isset( $configFromFile['ui']['enableQuantityEditing'] ) ) {
				$config['ui']['enableQuantityEditing'] = (bool) $configFromFile['ui']['enableQuantityEditing'];
			}
			if ( isset( $configFromFile['ui']['showFloatingCartIcon'] ) ) {
				$config['ui']['showFloatingCartIcon'] = (bool) $configFromFile['ui']['showFloatingCartIcon'];
			}
			if ( isset( $configFromFile['ui']['openTriggerElementId'] ) ) {
				$config['ui']['openTriggerElementId'] = (string) $configFromFile['ui']['openTriggerElementId'];
			}
			if ( isset( $configFromFile['ui']['badgeElementId'] ) ) {
				$config['ui']['badgeElementId'] = (string) $configFromFile['ui']['badgeElementId'];
			}
			if ( isset( $configFromFile['ui']['autoOpenOnAddToCart'] ) ) {
				$config['ui']['autoOpenOnAddToCart'] = (bool) $configFromFile['ui']['autoOpenOnAddToCart'];
			}
		}

		if ( isset( $configFromFile['cssVars'] ) && is_array( $configFromFile['cssVars'] ) ) {
			$config['cssVars'] = $configFromFile['cssVars'];
		}

		if ( isset( $configFromFile['cssClasses'] ) && is_array( $configFromFile['cssClasses'] ) ) {
			$config['cssClasses'] = $configFromFile['cssClasses'];
		}

		if ( isset( $configFromFile['mode'] ) ) {
			$mode = strtolower( trim( (string) $configFromFile['mode'] ) );
			if ( in_array( $mode, array( 'ui', 'headless' ), true ) ) {
				$config['mode'] = $mode;
			}
		}

		if ( isset( $configFromFile['dom'] ) && is_array( $configFromFile['dom'] ) ) {
			$selectors = array();
			if ( isset( $configFromFile['dom']['selectors'] ) && is_array( $configFromFile['dom']['selectors'] ) ) {
				$allowed = array(
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
				foreach ( $allowed as $key ) {
					if ( isset( $configFromFile['dom']['selectors'][ $key ] ) && is_string( $configFromFile['dom']['selectors'][ $key ] ) ) {
						$value = trim( (string) $configFromFile['dom']['selectors'][ $key ] );
						if ( $value !== '' ) {
							$selectors[ $key ] = $value;
						}
					}
				}
			}
			$config['dom'] = array(
				'selectors' => $selectors,
			);
		}

		if ( isset( $configFromFile['hooksHtml'] ) && is_array( $configFromFile['hooksHtml'] ) ) {
			foreach ( array( 'aboveItems', 'afterActions', 'afterFirstItem' ) as $key ) {
				if ( isset( $configFromFile['hooksHtml'][ $key ] ) ) {
					$config['hooksHtml'][ $key ] = (string) $configFromFile['hooksHtml'][ $key ];
				}
			}
		}

		if ( isset( $configFromFile['hooksHtmlOptions'] ) && is_array( $configFromFile['hooksHtmlOptions'] ) ) {
			if ( isset( $configFromFile['hooksHtmlOptions']['enabled'] ) ) {
				$config['hooksHtmlOptions']['enabled'] = (bool) $configFromFile['hooksHtmlOptions']['enabled'];
			}
			if ( isset( $configFromFile['hooksHtmlOptions']['maxLength'] ) ) {
				$config['hooksHtmlOptions']['maxLength'] = (int) $configFromFile['hooksHtmlOptions']['maxLength'];
			}
		}

		if ( isset( $configFromFile['hooksHtmlPolicy'] ) ) {
			$policy = strtolower( trim( (string) $configFromFile['hooksHtmlPolicy'] ) );
			if ( in_array( $policy, array( 'post', 'strict', 'none' ), true ) ) {
				$config['hooksHtmlPolicy'] = $policy;
			}
		}

		return $config;
	}

	/**
	 * @param mixed $config Merged config (after filters).
	 * @param array $defaults Defaults.
	 * @return array
	 */
	private function validateConfig( $config, $defaults ) {
		if ( ! is_array( $config ) ) {
			return $defaults;
		}

		// storeApi.
		if ( ! isset( $config['storeApi'] ) || ! is_array( $config['storeApi'] ) ) {
			$config['storeApi'] = $defaults['storeApi'];
		}
		if ( ! isset( $config['storeApi']['cacheBusting'] ) || ! is_array( $config['storeApi']['cacheBusting'] ) ) {
			$config['storeApi']['cacheBusting'] = $defaults['storeApi']['cacheBusting'];
		}
		$config['storeApi']['cacheBusting']['enabled'] = isset( $config['storeApi']['cacheBusting']['enabled'] ) ? (bool) $config['storeApi']['cacheBusting']['enabled'] : (bool) $defaults['storeApi']['cacheBusting']['enabled'];
		$param = isset( $config['storeApi']['cacheBusting']['param'] ) ? trim( (string) $config['storeApi']['cacheBusting']['param'] ) : (string) $defaults['storeApi']['cacheBusting']['param'];
		if ( $param === '' || strlen( $param ) > 64 || ! preg_match( '/^[a-zA-Z0-9_-]+$/', $param ) ) {
			$param = (string) $defaults['storeApi']['cacheBusting']['param'];
		}
		$config['storeApi']['cacheBusting']['param'] = $param;
		$strategy = isset( $config['storeApi']['cacheBusting']['strategy'] ) ? strtolower( trim( (string) $config['storeApi']['cacheBusting']['strategy'] ) ) : (string) $defaults['storeApi']['cacheBusting']['strategy'];
		if ( ! in_array( $strategy, array( 'timestamp', 'random' ), true ) ) {
			$strategy = (string) $defaults['storeApi']['cacheBusting']['strategy'];
		}
		$config['storeApi']['cacheBusting']['strategy'] = $strategy;

		// Mode.
		$mode = isset( $config['mode'] ) ? strtolower( trim( (string) $config['mode'] ) ) : $defaults['mode'];
		if ( ! in_array( $mode, array( 'ui', 'headless' ), true ) ) {
			$mode = $defaults['mode'];
		}
		$config['mode'] = $mode;

		// Parity.
		if ( ! isset( $config['parity'] ) || ! is_array( $config['parity'] ) ) {
			$config['parity'] = $defaults['parity'];
		}
		$gating = isset( $config['parity']['cartCheckoutGating'] ) ? strtolower( trim( (string) $config['parity']['cartCheckoutGating'] ) ) : (string) $defaults['parity']['cartCheckoutGating'];
		if ( ! in_array( $gating, array( 'removed', 'hidden' ), true ) ) {
			$gating = (string) $defaults['parity']['cartCheckoutGating'];
		}
		$config['parity']['cartCheckoutGating'] = $gating;

		$behaviour = isset( $config['parity']['onCartClickBehaviour'] ) ? strtolower( trim( (string) $config['parity']['onCartClickBehaviour'] ) ) : (string) $defaults['parity']['onCartClickBehaviour'];
		if ( ! in_array( $behaviour, array( 'open_drawer', 'navigate_to_checkout', 'navigate_to_cart', 'navigate_to_url' ), true ) ) {
			$behaviour = (string) $defaults['parity']['onCartClickBehaviour'];
		}
		$config['parity']['onCartClickBehaviour'] = $behaviour;

		$config['parity']['blocksSyncDebug'] = isset( $config['parity']['blocksSyncDebug'] ) ? (bool) $config['parity']['blocksSyncDebug'] : (bool) $defaults['parity']['blocksSyncDebug'];

		// UI.
		if ( ! isset( $config['ui'] ) || ! is_array( $config['ui'] ) ) {
			$config['ui'] = $defaults['ui'];
		}
		foreach ( array( 'showViewCartButton', 'showCheckoutButton', 'showItemRemove', 'showItemQuantity', 'enableQuantityEditing', 'showItemLinks', 'showItemPrice', 'showItemThumbnail', 'showSubtotal', 'showShipping', 'showTaxes', 'showTotal', 'showCoupons', 'showFloatingCartIcon', 'autoOpenOnAddToCart' ) as $flag ) {
			$config['ui'][ $flag ] = isset( $config['ui'][ $flag ] ) ? (bool) $config['ui'][ $flag ] : (bool) $defaults['ui'][ $flag ];
		}
		foreach ( array( 'openTriggerElementId', 'badgeElementId' ) as $field ) {
			$config['ui'][ $field ] = isset( $config['ui'][ $field ] ) ? (string) $config['ui'][ $field ] : (string) $defaults['ui'][ $field ];
		}

		// Dom selectors.
		if ( ! isset( $config['dom'] ) || ! is_array( $config['dom'] ) ) {
			$config['dom'] = $defaults['dom'];
		}
		if ( ! isset( $config['dom']['selectors'] ) || ! is_array( $config['dom']['selectors'] ) ) {
			$config['dom']['selectors'] = array();
		}

		// cssVars/cssClasses are kept as-is but ensured to be arrays.
		if ( ! isset( $config['cssVars'] ) || ! is_array( $config['cssVars'] ) ) {
			$config['cssVars'] = array();
		}
		if ( ! isset( $config['cssClasses'] ) || ! is_array( $config['cssClasses'] ) ) {
			$config['cssClasses'] = array();
		}

		// hooksHtml.
		if ( ! isset( $config['hooksHtml'] ) || ! is_array( $config['hooksHtml'] ) ) {
			$config['hooksHtml'] = $defaults['hooksHtml'];
		}
		foreach ( array( 'aboveItems', 'afterActions', 'afterFirstItem' ) as $key ) {
			$config['hooksHtml'][ $key ] = isset( $config['hooksHtml'][ $key ] ) ? (string) $config['hooksHtml'][ $key ] : '';
		}

		// hooksHtmlOptions.
		if ( ! isset( $config['hooksHtmlOptions'] ) || ! is_array( $config['hooksHtmlOptions'] ) ) {
			$config['hooksHtmlOptions'] = $defaults['hooksHtmlOptions'];
		}
		$config['hooksHtmlOptions']['enabled'] = isset( $config['hooksHtmlOptions']['enabled'] ) ? (bool) $config['hooksHtmlOptions']['enabled'] : (bool) $defaults['hooksHtmlOptions']['enabled'];
		$maxLength = isset( $config['hooksHtmlOptions']['maxLength'] ) ? (int) $config['hooksHtmlOptions']['maxLength'] : (int) $defaults['hooksHtmlOptions']['maxLength'];
		if ( $maxLength < 0 ) {
			$maxLength = (int) $defaults['hooksHtmlOptions']['maxLength'];
		}
		if ( $maxLength > 50000 ) {
			$maxLength = 50000;
		}
		$config['hooksHtmlOptions']['maxLength'] = $maxLength;

		// hooksHtmlPolicy. Default MUST remain post.
		$policy = isset( $config['hooksHtmlPolicy'] ) ? strtolower( trim( (string) $config['hooksHtmlPolicy'] ) ) : $defaults['hooksHtmlPolicy'];
		if ( ! in_array( $policy, array( 'post', 'strict', 'none' ), true ) ) {
			$policy = $defaults['hooksHtmlPolicy'];
		}
		$config['hooksHtmlPolicy'] = $policy;

		return $config;
	}
}
