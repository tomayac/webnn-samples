[![lint](https://github.com/webmachinelearning/webnn-samples/workflows/lint/badge.svg)](https://github.com/webmachinelearning/webnn-samples/actions)
[![deploy](https://github.com/webmachinelearning/webnn-samples/workflows/deploy/badge.svg)](https://github.com/webmachinelearning/webnn-samples/actions)

# WebNN API Samples
This repository contains a collection of samples and examples demonstrating Web Neural Network API (WebNN) usage in web applications. Web Neural Network API (WebNN) is a JavaScript API that provides a high-level interface for performing machine learning computations on neural networks in web applications. With WebNN, developers can leverage hardware acceleration to efficiently run inference tasks on various devices, including CPUs, GPUs, and dedicated AI accelerators. It simplifies the integration of machine learning models into web apps, opening up new possibilities for interactive experiences and intelligent applications right in the browser.

## Repository Structure
This repository hosts a wide range of samples and examples that showcase different use cases and functionalities of WebNN. Here's an overview of the directory structure:    

* [Code Editor](/code): This is a Code Editor used for evaluating, reviewing and modifying WebNN sample codes interactively in web browser.
* [Face recognition](/face_recognition): This directory contains examples of SSD MobileNet V2 Face and Face Landmark (SimpleCNN) model implementation.
* [Facial landmark detection](/facial_landmark_detection): This directory contains examples of SSD MobileNet V2 Face and Face Landmark (SimpleCNN) model implementation.
* [Image classification](/image_classification): This directory contains examples demonstrating image classification using pre-trained models with WebNN.
* [LeNet](/lenet): This example showcases the LeNet-based handwritten digits classification by WebNN API.
* [NNotepad](/nnotepad): This is a browser-based playground for experimenting with WebNN expressions without boilerplate code.
* [NSNet2](/nsnet2): This example shows how to implement the NSNet2 baseline implementation of a deep learning-based noise suppression model.
* [Object detection](/object_detection): Samples showcasing object detection tasks using WebNN with pre-trained models.
* [RNNoise](/rnnoise): This example shows the RNNoise baseline implementation of a deep learning-based noise suppression model.
* [Selfie segmentation](/selfie_segmentation): This example demonstrates the MediaPipe Selfie Segmentation models.
* [Semantic segmentation](/semantic_segmentation): This directory contains examples of implementing the DeepLab V3 MobileNet V2, from TFLite models.
* [Style transfer](/style_transfer): Explore examples highlighting the artistic possibilities of WebNN by applying style-transfer techniques to images.

## Requirements
You will require a compatible browser that supports Web Neural Network API (WebNN) to run the samples in this repository. Currently, Chrome and Edge browsers provide support for WebNN.

## Getting Started
To get started, follow these steps:    
1. Clone the repository to your local machine and navigate to it:
 ```bash
> git clone --recurse-submodules https://github.com/webmachinelearning/webnn-samples
> cd webnn-samples
> npm install
> npm run start
```
2. Navigate to the desired sample directory that you want to explore.
3. Read the accompanying README.md file for the sample to understand its purpose, requirements, and implementation details.
4. Follow the instructions provided in the README to set up the necessary dependencies and run the sample.
5. Keep in mind that WebNN currently supports the CPU backend only on Chrome or Edge browsers, and it requires enabling the experimental web platform features flag (see below). Ensure you have this flag enabled in your browser to fully experience WebNN functionality.
6. Experiment with the code and explore how WebNN can enhance machine learning tasks in the browser, navigating to http://localhost:8080.

### Deploy To Your Github Pages

WebNN Samples is currently hosted on GitHub Pages, with model files stored on Amazon S3 and distributed via CloudFront. If you host WebNN Samples on your own GitHub Pages, you may encounter a 'failed to fetch' error due to CORS policy restrictions. To resolve this issue, please update the [weightsOrigin() configuration](https://github.com/webmachinelearning/webnn-samples/blob/master/common/utils.js#L6) as described in the [issue 285](https://github.com/webmachinelearning/webnn-samples/issues/285#issuecomment-2408988830).

### Caching Model Weights In Cross-Origin Storage

Every sample loads its weights through `buildConstantByNpy()` in
[`common/utils.js`](common/utils.js), which now transparently caches them in
[Cross-Origin Storage](https://github.com/WICG/cross-origin-storage) (COS) when
the browser supports it. COS is a hash-addressed store that browsers share
between origins, so a model downloaded by one site can be reused by another
instead of being fetched again.

This is a progressive enhancement, and it is invisible when it doesn't apply. A
browser without COS, a model that isn't in the manifest, a manifest that has
drifted from the weights being served, an exhausted quota, or a user who
declines the storage prompt all fall back to exactly the network fetches the
samples did before.

COS is keyed by the hash of a single file, but a model here is a directory of
per-tensor `.npy` files — `face_landmark_nhwc/weights/` alone is 20 of them and
`resnet50v2_nchw/weights/` is 259. So the unit that gets content-addressed is
the directory, not the tensor: [`common/cos_bundle.js`](common/cos_bundle.js)
packs a directory into one deterministic bundle, and
[`common/weight_bundles.js`](common/weight_bundles.js) records the hash of each.
On a cache miss the browser fetches the individual files as usual, packs them,
checks the result against that hash, and stores it. Every later load — including
from a different origin — gets the whole model back in a single read.

The manifest is generated from the `test-data` submodule, and has to be
regenerated whenever that submodule moves:

```sh
git submodule update --init test-data
npm run generate-weight-bundles
```

Storing a bundle under a hash that other origins share is only safe if the bytes
really are what the manifest claims, so a mismatch is never stored: the sample
logs a warning telling you to re-run the command above, and carries on with the
weights it fetched.

### WebNN Installation Guides

Please visit [WebNN Installation Guides](https://webnn.io/en/learn/get-started/installation) to get started with WebNN on Intel AI PCs.

## Support and Feedback
If you encounter any issues or have feedback on the WebNN Samples, please open an issue on the repository. We appreciate your input and will strive to address any problems as quickly as possible.

You can also join our [community forum](https://webmachinelearning.github.io/) for general questions and discussions about WebNN.

## Contributing
We welcome contributions from the community to make webnn-samples even better! If you have an idea for a new sample, an improvement to an existing one, or any other enhancement, please feel free to submit a pull request.

## Resources
### WebNN Resources
To learn more about Web Neural Network API (WebNN) and its capabilities, check out the following resources:
* [Web Neural Network API Specification](https://webmachinelearning.github.io/webnn/)
* [W3C WebML Working Group and Community Group](https://webmachinelearning.github.io/)

### WebNN API Samples
* [WebNN code editor](https://webmachinelearning.github.io/webnn-samples/code/)
* [NNotepad](https://webmachinelearning.github.io/webnn-samples/nnotepad/)
* [Handwritten digits classification](https://webmachinelearning.github.io/webnn-samples/lenet/)
* Noise suppression:
  * [NSNet2](https://webmachinelearning.github.io/webnn-samples/nsnet2/)
  * [RNNoise](https://webmachinelearning.github.io/webnn-samples/rnnoise/)
* [Fast style transfer](https://webmachinelearning.github.io/webnn-samples/style_transfer/)
* [Semantic segmentation](https://webmachinelearning.github.io/webnn-samples/semantic_segmentation/)
* [Facial Landmark Detection](https://webmachinelearning.github.io/webnn-samples/facial_landmark_detection/)
* [Image classification](https://webmachinelearning.github.io/webnn-samples/image_classification/)
* [Object detection](https://webmachinelearning.github.io/webnn-samples/object_detection/)

## Acknowledgements
We thank the entire WebNN community for their valuable contributions and feedback. Your support and enthusiasm have been instrumental in making WebNN a robust and accessible tool for machine learning in the web ecosystem.

We also want to thank the developers and researchers behind the underlying technologies that power WebNN, including the Web Neural Network API and related frameworks. Their efforts have paved the way for seamless machine-learning experiences in web browsers.

We appreciate your interest in WebNN Samples! We hope you find these examples inspiring and educational. Happy coding with Web Neural Networks!

