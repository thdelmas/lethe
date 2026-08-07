package org.osmosis.lethe;

import android.content.Context;
import android.view.View;

/**
 * Single chooser for every mascot surface. All hosts (keyguard,
 * MascotActivity, future screens) MUST create the mascot through here
 * so the mascot looks and behaves identically everywhere:
 * live Filament render (gated) → sprite strips → Canvas guardian.
 */
final class MascotViews {

    private MascotViews() {}

    static View create(Context context) {
        if (FilamentMascotView.available(context)) {
            return new FilamentMascotView(context);
        }
        if (SpriteMascotView.available(context)) {
            return new SpriteMascotView(context);
        }
        return new MascotView(context);
    }

    static void setState(View mascot, String state) {
        if (mascot instanceof FilamentMascotView) {
            ((FilamentMascotView) mascot).setMascotState(state);
        } else if (mascot instanceof SpriteMascotView) {
            ((SpriteMascotView) mascot).setMascotState(state);
        } else if (mascot instanceof MascotView) {
            ((MascotView) mascot).setMascotState(state);
        }
    }
}
