A tool is supposed to be recognizing various unknown Excel (in csv format) templates, containing more or less the same data. WIP.

## The approach

Using the training data set and manual mapping the data is separated into classes, hereby named "Categories". All the unfitting data can be either discarded or added to a specific "insignificant" category. The data is feeded to a [Multi-layer perceptron](https://en.wikipedia.org/wiki/Multilayer_perceptron) implemented with [SynapticJS](https://github.com/cazala/synaptic). For the test set data is feeded to the network column by column, and the resulting output vectors are summarized to identify a probability of a column to belong a specific category. There is no option to discard unknown values as of now, so they might have a relatively high chance of falling into certain (incorrect category.

## Current status
SynapticJS is incapable of utilizing multi-core calculations as of now, so it probably will be replaced by deeplearn.js or a proper Python framework.
The solution has quite good precision even with few training iterations: 5 times 200 iterations takes about 2h on 1 core of i7-7700HQ and gives around 90% recognition rate for categories having quite enough data, especially  if the columns are named in a more or less meaningful way. The input set is though much unbalanced in my case, so with categories having only few possible values it is almost useless. But those can be recognized just by direct matching or some approximate analytical solution, like Dice coefficient.

## Implementation details

The string data is embedded into vector space by an algorithm heavily inspired by [this work](http://homepage.tudelft.nl/a9p19/papers/pr_07_strings.pdf). Cell values are concatenated with a respective column name with few prior transormations: 
* Unicode symbols are transliterated into corresponding ascii symbols using [transliteration package](https://www.npmjs.com/package/transliteration)
* Table column names are compressed using [Skeleton algorithm](http://yomguithereal.github.io/talisman/keyers#skeleton)
* Cell values are normalized using [Fingerpring function](http://yomguithereal.github.io/talisman/keyers#fingerprint) from [an awesome Talisman library](https://github.com/Yomguithereal/talisman/) 

For each apriori known category a [k-medoids clusterization](https://en.wikipedia.org/wiki/K-medoids) is performed with 2 clusters per category, using [edit distance](https://en.wikipedia.org/wiki/Damerau-Levenshtein_distance) as a metric (more is possible but doesn't provide too much accuracy gain according to my experiments), and medoids of each cluster are chosen, thus producing a set of _Prototypes_. Empty values are included, if the column contains anything else but empty values. For the chosen values also a frequency of character occurence is calculated, with separately counting capital letters, and grouping all unmapped symbols into "Rest" frequency. The resulting input vector is then built by applying the distance metric to an input value against every of chosen Prototypes. Every distance metric consists of two values: the Damerau-Levenstein distance between the input value and the prototype, and the Euclidian distance between their respective character frequencies. The resulting vector thus consists of 2 x [amount of prototypes] values, and is L2-Normalized.

The output vector is produced by binary occlusion of a category to a category list: {0,0,...1,...,0}, where index of 1 is the index of the respective category in a list.

The processed data is then shuffled and fed to a network repeatedly with cross enthropy cost function, gradient descent back-propagation. The network has the following layers:
* an input layer, consisting of twice as many neurons, as number of selected prototypes
* a hidden layer with the same amount of neurons as in the input layer
* the output layer with as many neurons as there are categories

The training rate is reduced throughout every learning cycle, starting from relatively big value and ending with a really small one. The training automatically stops if an error reduces to 10E-4

To test the data one must map the input files into the same space, thus using the same prototypes and distance functions which were used for traning


