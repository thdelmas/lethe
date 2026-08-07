plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "org.osmosis.filamentprobe"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.osmosis.filamentprobe"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    // GLB must not be recompressed or mmap-loading fails silently
    androidResources { noCompress += "glb" }
}

dependencies {
    implementation("com.google.android.filament:filament-android:1.51.0")
    implementation("com.google.android.filament:gltfio-android:1.51.0")
    implementation("com.google.android.filament:filament-utils-android:1.51.0")
}
