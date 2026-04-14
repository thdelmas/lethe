# LETHE Nix build environment — isolated container.
#
# Usage:
#   docker build -f Dockerfile.nix -t lethe-nix .
#   docker run -it -v ./keys:/keys:ro lethe-nix
#
# Build a device image:
#   docker run -it -v ./keys:/keys:ro lethe-nix \
#     nix build .#robotnixConfigurations.panther.img
#
FROM nixos/nix:latest

# Enable flakes
RUN mkdir -p /etc/nix && \
    echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf && \
    echo "max-jobs = auto" >> /etc/nix/nix.conf

WORKDIR /lethe

# Copy source and initialize a fresh git repo so Nix flakes can resolve.
# The original .git is a submodule reference that doesn't work in isolation.
COPY . .
RUN rm -f .git && \
    git init && \
    git config user.email "build@lethe" && \
    git config user.name "lethe-build" && \
    git add -A && \
    git commit -m "container snapshot"

# Resolve flake inputs (pins LineageOS + Robotnix versions in flake.lock)
RUN nix flake lock --accept-flake-config

# Default: drop into the dev shell
CMD ["nix", "develop"]
