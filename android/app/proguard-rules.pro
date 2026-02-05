# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:
-keep class com.facebook.hermes.** { *; }

# ========== CORE REACT NATIVE ==========
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.soloader.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.hermes.unicode.** { *; }

# Bridge and native modules
-keep public class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class com.facebook.react.bridge.** { *; }
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod *; }

# View system
-keep @com.facebook.react.uimanager.annotations.ReactProp class * { *; }
-keep @com.facebook.react.uimanager.annotations.ReactPropGroup class * { *; }
-keep class * extends com.facebook.react.uimanager.ViewManager { *; }
-keep class com.facebook.react.uimanager.** { *; }

# JavaScript and events
-keep class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * extends com.facebook.react.uimanager.events.Event { *; }

# TurboModules and animation
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.animated.** { *; }

# ========== THIRD-PARTY LIBRARIES ==========
# React Navigation
-keep class com.swmansion.** { *; }
-dontwarn com.swmansion.**

# Firebase
-keep class io.invertase.firebase.** { *; }
-dontwarn io.invertase.firebase.**
-dontwarn com.google.firebase.**

# Realm
-keep class io.realm.** { *; }
-keep class io.realm.react.** { *; }
-dontwarn io.realm.**

# Async Storage
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# MMKV
-keep class com.reactnativemmkv.** { *; }

# Device Info
-keep class com.learnium.RNDeviceInfo.** { *; }

# Permissions
-keep class com.zoontek.rnpermissions.** { *; }

# Fast Image
-keep class com.dylanvann.fastimage.** { *; }

# SVG
-keep class com.horcrux.svg.** { *; }
-dontwarn com.horcrux.svg.**

# WebView
-keep class com.reactnativecommunity.webview.** { *; }

# Braze
-keep class com.braze.** { *; }
-dontwarn com.braze.**

# ========== NETWORKING ==========
-keepattributes Signature, *Annotation*
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# AWS SDK
-keep class com.amazonaws.** { *; }
-dontwarn com.amazonaws.**

# ========== OPTIMIZATIONS ==========
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-optimizationpasses 3
-allowaccessmodification
-overloadaggressively
-mergeinterfacesaggressively
-repackageclasses ''
-dontusemixedcaseclassnames
-dontpreverify

# Remove logging
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
    public static *** w(...);
    public static *** e(...);
}

# Debug info
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile