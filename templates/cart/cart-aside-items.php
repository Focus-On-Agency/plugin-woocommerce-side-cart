<?php 
	
/**
 *
 * Override this template by copying it to yourtheme/woocommerce/cart/cart-aside-items.php
 *
 * @author 		Creative Little Dots
 * @package 	WooCommerce/Templates
 * @version     1.0
 */
 
if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}
 
?>

<div class="side-cart__items js-side-cart-items">
	<?php if ( WC()->cart->is_empty() ) : ?>

		<?php wc_get_template( 'cart/cart-empty.php' ); ?>

	<?php else : ?>

		<?php foreach ( WC()->cart->get_cart() as $cart_item_key => $cart_item ) : ?>

			<?php $_product = apply_filters( 'woocommerce_cart_item_product', $cart_item['data'], $cart_item, $cart_item_key ); ?>

			<?php if ( $_product && $_product->exists() && $cart_item['quantity'] > 0 && apply_filters( 'woocommerce_cart_item_visible', true, $cart_item, $cart_item_key ) ) : ?>

				<div class="item side-cart__item">

					<h5 class="side-cart__item_name">

						<?php
												
						if ( ! $_product->is_visible() ) {
							echo wp_kses_post( apply_filters( 'woocommerce_cart_item_name', $_product->get_name(), $cart_item, $cart_item_key ) ) . '&nbsp;';
						} else {
							$product_permalink = $_product->get_permalink( $cart_item );
							$product_name_html = sprintf(
								'<a href="%s">%s</a>',
								esc_url( $product_permalink ),
								esc_html( $_product->get_name() )
							);

							echo wp_kses_post( apply_filters( 'woocommerce_cart_item_name', $product_name_html, $cart_item, $cart_item_key ) );
						}

						?>

						|

						<a href="<?php echo esc_url( wp_nonce_url( add_query_arg( array( 'remove_item' => $cart_item_key ), wc_get_cart_url() ), 'woocommerce-cart' ) ); ?>" class="side-cart__remove_item js-remove-basket-item" title="<?php echo esc_attr__( 'Remove this item', 'woocommerce' ); ?>" aria-label="<?php echo esc_attr__( 'Remove this item', 'woocommerce' ); ?>" data-cart_item_key="<?php echo esc_attr( $cart_item_key ); ?>"><?php echo esc_html__( 'Remove', 'woocommerce' ); ?></a>

					</h5>

					<?php

						echo wp_kses_post( WC()->cart->get_item_data( $cart_item ) );

						if ( $_product->backorders_require_notification() && $_product->is_on_backorder( $cart_item['quantity'] ) ) {
							echo '<p class="backorder_notification">' . esc_html__( 'Available on backorder', 'woocommerce' ) . '</p>';
						}

						do_action( 'wc_side_cart_after_product_title', $_product, $cart_item, $cart_item_key );

					?>

				</div>

			<?php endif; ?>

		<?php endforeach; ?>

	<?php endif; ?>
	
	<template class="js-side-cart-empty-template">
		<?php wc_get_template( 'cart/cart-empty.php' ); ?>
	</template>

</div>
