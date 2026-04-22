import { strict as assert } from "assert";

import { resolveRepoVolumeTarget } from "../src/utils/repoStorageMetrics.js";

describe("repoStorageMetrics", function () {
  describe("resolveRepoVolumeTarget()", function () {
    it("should map preview environments to preview PVC names", function () {
      assert.deepEqual(resolveRepoVolumeTarget("preview:connerreiter2"), {
        namespace: "preview-connerreiter2",
        persistentVolumeClaim: "repo-vol-connerreiter2",
      });
    });

    it("should map production to the shared storage PVC", function () {
      assert.deepEqual(resolveRepoVolumeTarget("production"), {
        namespace: "storage",
        persistentVolumeClaim: "repo-vol-rwo-pvc",
      });
    });

    it("should map develop to the shared storage PVC", function () {
      assert.deepEqual(resolveRepoVolumeTarget("develop"), {
        namespace: "storage",
        persistentVolumeClaim: "repo-vol-rwo-pvc",
      });
    });

    it("should map local to the shared storage PVC fallback", function () {
      assert.deepEqual(resolveRepoVolumeTarget("local"), {
        namespace: "storage",
        persistentVolumeClaim: "repo-vol-rwo-pvc",
      });
    });

    it("should return null for unknown environments", function () {
      assert.equal(resolveRepoVolumeTarget("mystery-host"), null);
    });
  });
});
