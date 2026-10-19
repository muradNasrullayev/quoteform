FROM php:8.2-cli

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		default-mysql-client subversion unzip git \
	&& rm -rf /var/lib/apt/lists/* \
	&& docker-php-ext-install mysqli

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
