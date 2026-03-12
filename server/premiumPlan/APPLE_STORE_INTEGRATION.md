# Apple Store Subscription Integration Guide

## Overview
This document outlines the complete Apple Store subscription integration for the premium plan system.

## Prerequisites

### 1. Apple Developer Account Setup
- Create an Apple Developer account
- Set up your app in App Store Connect
- Configure subscription products with the same `productKey` as in your premium plans
- Enable App Store Server API

### 2. App Store Connect API Setup
1. Go to App Store Connect → Users and Access → Keys
2. Create a new API key with App Store Connect API access
3. Download the private key file (.p8)
4. Note the Key ID and Issuer ID

### 3. Environment Variables
Add these to your `.env` file:
```env
APPLE_STORE_KEY_ID=your-key-id
APPLE_STORE_ISSUER_ID=your-issuer-id
APPLE_STORE_PRIVATE_KEY=your-private-key-content
APPLE_STORE_BUNDLE_ID=com.yourapp.bundle
```

## API Endpoints

### 1. Create Subscription History (with Apple Store verification)
**POST** `/premiumPlan/createHistory`

**Request Body:**
```json
{
  "premiumPlanId": "plan_id_here",
  "paymentGateway": "AppleStore",
  "originalTransactionId": "apple_original_transaction_id",
  "transactionId": "apple_transaction_id",
  "bundleId": "com.yourapp.bundle",
  "productId": "your_product_id"
}
```

**Response:**
```json
{
  "status": true,
  "message": "Success",
  "history": {
    "userId": "user_id",
    "premiumPlanId": "plan_id",
    "paymentGateway": "AppleStore",
    "status": "active",
    "appleStoreOriginalTransactionId": "original_transaction_id",
    "appleStoreExpiresDate": "2024-12-31T23:59:59.000Z"
  }
}
```

### 2. Verify Apple Store Purchase
**POST** `/premiumPlan/verifyAppleStorePurchase`

**Request Body:**
```json
{
  "originalTransactionId": "apple_original_transaction_id",
  "productId": "your_product_id",
  "bundleId": "com.yourapp.bundle"
}
```

### 3. Check Apple Store Subscription Status
**POST** `/premiumPlan/checkAppleStoreSubscription`

**Request Body:**
```json
{
  "originalTransactionId": "apple_original_transaction_id"
}
```

### 4. Apple Store Webhook
**POST** `/premiumPlan/appleStoreWebhook`

This endpoint receives server-side notifications from Apple Store about subscription changes.

## Implementation Flow

### 1. Client-Side (iOS App)
```swift
import StoreKit

class SubscriptionManager: NSObject, SKPaymentTransactionObserver {
    
    // 1. Initialize StoreKit
    override init() {
        super.init()
        SKPaymentQueue.default().add(self)
    }
    
    // 2. Request subscription products
    func requestSubscriptionProducts() {
        let productIdentifiers = Set(["premium_monthly", "premium_yearly"])
        let request = SKProductsRequest(productIdentifiers: productIdentifiers)
        request.delegate = self
        request.start()
    }
    
    // 3. Purchase subscription
    func purchaseSubscription(product: SKProduct) {
        let payment = SKPayment(product: product)
        SKPaymentQueue.default().add(payment)
    }
    
    // 4. Handle purchase result
    func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction]) {
        for transaction in transactions {
            switch transaction.transactionState {
            case .purchased, .restored:
                // Send to your server for verification
                sendPurchaseToServer(transaction)
                SKPaymentQueue.default().finishTransaction(transaction)
            case .failed:
                SKPaymentQueue.default().finishTransaction(transaction)
            case .deferred, .purchasing:
                break
            @unknown default:
                break
            }
        }
    }
    
    // 5. Send purchase to server
    private func sendPurchaseToServer(_ transaction: SKPaymentTransaction) {
        let requestBody: [String: Any] = [
            "premiumPlanId": getPlanIdFromProductId(transaction.payment.productIdentifier),
            "paymentGateway": "AppleStore",
            "originalTransactionId": transaction.original?.transactionIdentifier ?? transaction.transactionIdentifier ?? "",
            "transactionId": transaction.transactionIdentifier ?? "",
            "bundleId": Bundle.main.bundleIdentifier ?? "",
            "productId": transaction.payment.productIdentifier
        ]
        
        // Make API call to /premiumPlan/createHistory
        sendToServer(requestBody)
    }
}
```

### 2. Server-Side Verification
The server automatically:
1. Verifies the transaction with Apple Store
2. Checks if the purchase is valid and not consumed
3. Prevents duplicate purchases
4. Updates user subscription status
5. Sends notifications

## Webhook Configuration

### 1. App Store Connect Setup
1. Go to App Store Connect → Apps → Your App → App Information
2. Scroll to "App Store Server Notifications"
3. Add your webhook URL: `https://yourapi.com/premiumPlan/appleStoreWebhook`
4. Select notification types:
   - CONSUMPTION_REQUEST
   - DID_CHANGE_RENEWAL_PREF
   - DID_CHANGE_RENEWAL_STATUS
   - DID_FAIL_TO_RENEW
   - DID_RENEW
   - EXPIRED
   - GRACE_PERIOD_EXPIRED
   - OFFER_REDEEMED
   - PRICE_INCREASE
   - REFUND
   - REFUND_DECLINED
   - RENEWAL_EXTENDED
   - SUBSCRIBED
   - TEST

### 2. Webhook Security
The webhook endpoint doesn't require authentication as it's called by Apple's servers. However, you should:
- Verify the request comes from Apple's IP ranges
- Implement rate limiting
- Log all webhook events for debugging

## Testing

### 1. Test Accounts
Add test accounts in App Store Connect:
1. Go to Users and Access → Sandbox Testers
2. Add email addresses of test users
3. These accounts can make test purchases without real money

### 2. Test Products
Create test subscription products:
- Use test product IDs
- Set test prices
- Test all subscription states

### 3. Testing Flow
1. Install app on test device
2. Sign in with test account
3. Make test purchase
4. Verify server receives and processes the purchase
5. Test subscription cancellation
6. Test subscription renewal

## Error Handling

### Common Issues

1. **Invalid Transaction ID**
   - Transaction expired or already consumed
   - Wrong product ID or bundle ID
   - API credentials not configured properly

2. **Duplicate Purchase**
   - Same transaction ID used multiple times
   - Check existing purchases before processing

3. **Verification Failed**
   - Apple Store credentials incorrect
   - Network issues
   - API quota exceeded

### Error Responses
```json
{
  "status": false,
  "message": "Apple Store verification failed: Invalid transaction ID"
}
```

## Monitoring

### 1. Logs to Monitor
- Purchase verification attempts
- Webhook notifications received
- Subscription status changes
- Error responses from Apple Store API

### 2. Metrics to Track
- Successful purchases vs failures
- Webhook delivery success rate
- Subscription renewal rates
- Cancellation rates

### 3. Alerts to Set
- High failure rate in purchase verification
- Webhook endpoint not responding
- Apple Store API quota approaching limit

## Security Considerations

1. **Transaction ID Security**
   - Never expose transaction IDs in client logs
   - Store IDs securely in database
   - Validate IDs server-side only

2. **API Key Security**
   - Keep API keys secure
   - Rotate keys regularly
   - Use least privilege principle

3. **Webhook Security**
   - Verify request origin
   - Implement rate limiting
   - Log all webhook events

## Troubleshooting

### 1. Purchase Not Being Processed
- Check if transaction ID is valid
- Verify API credentials have correct permissions
- Check if product ID matches in App Store Connect

### 2. Webhook Not Receiving Notifications
- Verify webhook URL is correct and accessible
- Check if notifications are enabled in App Store Connect
- Monitor server logs for webhook requests

### 3. Subscription Status Not Updating
- Check webhook processing logic
- Verify user plan update logic
- Monitor database for status changes

## Best Practices

1. **Always verify purchases server-side**
2. **Handle all subscription states**
3. **Implement proper error handling**
4. **Log all transactions for debugging**
5. **Test thoroughly with test accounts**
6. **Monitor webhook delivery**
7. **Implement retry logic for failed verifications**
8. **Keep Apple Store credentials secure**

## Support

For Apple Store Billing issues:
- [App Store Server API Documentation](https://developer.apple.com/documentation/appstoreserverapi)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [StoreKit Documentation](https://developer.apple.com/documentation/storekit) 